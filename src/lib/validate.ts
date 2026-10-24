import type { Dataset, Period, ScheduleRow } from '../types';
import { createLookup, previousPeriodId, sortedPeriods } from './dataset';
import { ExpressionError, parseExpression, type Node } from './expression';
import { evaluateInPeriod, type FormulaFailure } from './formula';

export const DEFAULT_TOLERANCE = 0.01;

export type CheckStatus = 'pass' | 'fail' | 'skipped';

export interface ValidationReason {
  code: FormulaFailure | 'invalid-expression';
  detail: string;
}

export interface CheckResult {
  checkId: string;
  labelDe: string;
  /** Views in which the check is shown (undefined = every view). */
  views?: string[];
  period: string;
  status: CheckStatus;
  lhs?: number;
  rhs?: number;
  diff?: number;
  reason?: ValidationReason;
}

export interface ValidationReport {
  results: CheckResult[];
  passed: number;
  failed: number;
  skipped: number;
  /** True when no check failed. Skipped checks (missing values) do not fail a report. */
  ok: boolean;
}

/** Missing values make a check inapplicable; everything else is a real failure. */
function statusForReason(code: ValidationReason['code']): CheckStatus {
  return code === 'null-value' || code === 'no-previous-period' ? 'skipped' : 'fail';
}

/**
 * Runs every reconciliation check of the dataset for every period.
 * The checks are data (`lhs` = `rhs` within a tolerance), so the same engine
 * can validate other companies' datasets later.
 */
export function validateDataset(dataset: Dataset): ValidationReport {
  const lookup = createLookup(dataset);
  const tolerance = dataset.conventions.tolerance ?? DEFAULT_TOLERANCE;
  const periods = sortedPeriods(dataset);
  const results: CheckResult[] = [];

  for (const check of dataset.checks) {
    let lhsNode: Node | null = null;
    let rhsNode: Node | null = null;
    let parseError: string | null = null;
    try {
      lhsNode = parseExpression(check.lhs);
      rhsNode = parseExpression(check.rhs);
    } catch (error) {
      parseError = error instanceof ExpressionError ? error.message : 'invalid expression';
    }

    for (const period of periods) {
      if (check.periods && !check.periods.includes(period.id)) continue;
      const base = { checkId: check.id, labelDe: check.labelDe, views: check.views, period: period.id };

      if (!lhsNode || !rhsNode) {
        results.push({
          ...base,
          status: 'fail',
          reason: { code: 'invalid-expression', detail: parseError ?? 'invalid expression' },
        });
        continue;
      }

      const previousId = previousPeriodId(dataset, period.id);
      const left = evaluateInPeriod(lhsNode, lookup, period.id, previousId);
      const right = evaluateInPeriod(rhsNode, lookup, period.id, previousId);
      const failure = !left.ok ? left : !right.ok ? right : null;

      if (failure && !failure.ok) {
        results.push({
          ...base,
          status: statusForReason(failure.reason),
          reason: { code: failure.reason, detail: failure.detail },
        });
        continue;
      }
      if (!left.ok || !right.ok) continue; // unreachable, narrows the types

      const diff = left.value - right.value;
      results.push({
        ...base,
        status: Math.abs(diff) <= tolerance ? 'pass' : 'fail',
        lhs: left.value,
        rhs: right.value,
        diff,
      });
    }
  }

  return summarize([...results, ...validateSchedules(dataset, periods)]);
}

/** Identity checks over the schedule columns (roll-forward of the Anlagespiegel). */
function validateSchedules(dataset: Dataset, periods: Period[]): CheckResult[] {
  const results: CheckResult[] = [];
  const tolerance = dataset.conventions.tolerance ?? DEFAULT_TOLERANCE;
  for (const schedule of dataset.schedules ?? []) {
    const roleOf = new Map(schedule.columns.map((c) => [c.role, c.key]));
    const cell = (row: ScheduleRow, period: string, role: string): number | null => {
      const key = roleOf.get(role as never);
      if (!key) return null;
      const value = row.values[period]?.[key];
      return value === undefined ? null : value;
    };
    const rules: { id: string; labelDe: string; check: (row: ScheduleRow, period: string) => [number, number] | null }[] = [
      {
        id: 'cost-rollforward',
        labelDe: 'AHK: Anfang + Zugänge − Abgänge ± Umbuchungen = Ende',
        check: (row, period) => {
          const end = cell(row, period, 'cost-end');
          if (end === null) return null;
          const lhs =
            (cell(row, period, 'cost-start') ?? 0) +
            (cell(row, period, 'additions') ?? 0) -
            (cell(row, period, 'disposals') ?? 0) +
            (cell(row, period, 'transfers') ?? 0);
          return [lhs, end];
        },
      },
      {
        id: 'accdep-rollforward',
        labelDe: 'AfA: Anfang + Abschreibung − Abgänge ± Umbuchungen = Ende',
        check: (row, period) => {
          const end = cell(row, period, 'accdep-end');
          if (end === null) return null;
          const lhs =
            (cell(row, period, 'accdep-start') ?? 0) +
            (cell(row, period, 'dep-expense') ?? 0) -
            (cell(row, period, 'dep-disposals') ?? 0) +
            (cell(row, period, 'dep-transfers') ?? 0);
          return [lhs, end];
        },
      },
      {
        id: 'book-value',
        labelDe: 'Restbuchwert = AHK Ende − AfA Ende',
        check: (row, period) => {
          const book = cell(row, period, 'book-value');
          const cost = cell(row, period, 'cost-end');
          const dep = cell(row, period, 'accdep-end');
          if (book === null || cost === null || dep === null) return null;
          return [cost - dep, book];
        },
      },
      {
        id: 'book-value-prior',
        labelDe: 'Restbuchwert Vorjahr = AHK Anfang − AfA Anfang',
        check: (row, period) => {
          const book = cell(row, period, 'book-value-prior');
          const cost = cell(row, period, 'cost-start');
          const dep = cell(row, period, 'accdep-start');
          if (book === null || cost === null || dep === null) return null;
          return [cost - dep, book];
        },
      },
    ];

    for (const rule of rules) {
      for (const period of periods) {
        let passed = 0;
        let failed = 0;
        let worst: { row: string; diff: number } | null = null;
        for (const row of schedule.rows) {
          const pair = rule.check(row, period.id);
          if (!pair) continue;
          const diff = pair[0] - pair[1];
          if (Math.abs(diff) <= tolerance) passed += 1;
          else {
            failed += 1;
            if (!worst || Math.abs(diff) > Math.abs(worst.diff)) worst = { row: row.labelDe, diff };
          }
        }
        if (passed + failed === 0) continue;
        results.push({
          checkId: `${schedule.id}:${rule.id}`,
          labelDe: `${schedule.labelDe} – ${rule.labelDe}`,
          views: ['anlagespiegel'],
          period: period.id,
          status: failed === 0 ? 'pass' : 'fail',
          diff: worst?.diff,
          reason: worst ? { code: 'not-finite', detail: `${worst.row}: Abweichung ${worst.diff.toFixed(2)}` } : undefined,
        });
      }
    }
  }
  return results;
}

function summarize(results: CheckResult[]): ValidationReport {
  const count = (status: CheckStatus) => results.filter((r) => r.status === status).length;
  const failed = count('fail');
  return { results, passed: count('pass'), failed, skipped: count('skipped'), ok: failed === 0 };
}

/** The part of a report that belongs to one view. Checks without `views` belong to every view. */
export function reportForView(report: ValidationReport, viewId: string): ValidationReport {
  return summarize(report.results.filter((r) => !r.views || r.views.includes(viewId)));
}

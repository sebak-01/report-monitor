import type { Dataset } from '../types';
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

  return summarize(results);
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

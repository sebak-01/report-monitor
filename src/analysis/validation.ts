/**
 * Plausibility checks (Prüfstatus): balance identity, sub-total sums and the
 * prior-year comparison across report extracts. Pure functions returning
 * German findings; the UI turns them into the green/amber/red summary.
 *
 * Missing values follow the dataset conventions: a key the company never
 * prints (`undefined`) counts as 0 in sums, a key without a value for the year
 * (`null`) makes the check "nicht prüfbar" – a missing figure is a skip, not a
 * zero (same rule as the built-in reconciliation checks).
 */

import { formatAmount } from '../lib/format';
import type {
  AnalysisLookup,
  CheckFinding,
  CheckSummary,
  FormulaPart,
  RawReport,
} from './types';

/** Absolute tolerance for money comparisons, mirroring `DEFAULT_TOLERANCE` of `src/lib/validate.ts`. */
export const DEFAULT_TOLERANCE = 0.01;

/** A sub-total that must equal the sum of its components. */
export interface SubtotalGroup {
  id: string;
  labelDe: string;
  totalKey: string;
  parts: FormulaPart[];
}

/** Sub-totals of the § 266 HGB skeleton and the GuV chain, in display order. */
export const SUBTOTAL_GROUPS: SubtotalGroup[] = [
  {
    id: 'assets_composition',
    labelDe: 'Anlage- + Umlaufvermögen + RAP = Bilanzsumme',
    totalKey: 'total_assets',
    parts: [
      { key: 'fixed_assets_total', sign: 1 },
      { key: 'current_assets_total', sign: 1 },
      { key: 'prepaid_expenses', sign: 1 },
      { key: 'deferred_tax_asset', sign: 1 },
      { key: 'net_pension_asset', sign: 1 },
    ],
  },
  {
    id: 'liabilities_composition',
    labelDe: 'Eigenkapital + Sonderposten + Rückstellungen + Verbindlichkeiten = Bilanzsumme',
    totalKey: 'total_equity_and_liabilities',
    parts: [
      { key: 'equity_total', sign: 1 },
      { key: 'special_item_grants', sign: 1 },
      { key: 'provisions_total', sign: 1 },
      { key: 'liabilities_total', sign: 1 },
      { key: 'deferred_income', sign: 1 },
      { key: 'deferred_tax_liability', sign: 1 },
    ],
  },
  {
    id: 'fixed_assets_sum',
    labelDe: 'Immaterielle Vermögensgegenstände + Sachanlagen + Finanzanlagen = Anlagevermögen',
    totalKey: 'fixed_assets_total',
    parts: [
      { key: 'intangible_assets', sign: 1 },
      { key: 'tangible_assets_total', sign: 1 },
      { key: 'financial_assets_total', sign: 1 },
    ],
  },
  {
    id: 'tangible_assets_sum',
    labelDe: 'Sachanlagen Summe',
    totalKey: 'tangible_assets_total',
    parts: [
      { key: 'land_buildings', sign: 1 },
      { key: 'technical_equipment', sign: 1 },
      { key: 'other_equipment', sign: 1 },
      { key: 'construction_in_progress', sign: 1 },
    ],
  },
  {
    id: 'equity_composition',
    labelDe: 'Eigenkapital = Kapital + Rücklagen + Gewinnvortrag + Jahresergebnis',
    totalKey: 'equity_total',
    parts: [
      { key: 'subscribed_capital', sign: 1 },
      { key: 'capital_reserve', sign: 1 },
      { key: 'retained_earnings_total', sign: 1 },
      { key: 'profit_loss_carryforward', sign: 1 },
      { key: 'net_result_balance', sign: 1 },
    ],
  },
  {
    id: 'current_assets_sum',
    labelDe: 'Umlaufvermögen Summe',
    totalKey: 'current_assets_total',
    parts: [
      { key: 'inventories_total', sign: 1 },
      { key: 'receivables_total', sign: 1 },
      { key: 'securities_current_total', sign: 1 },
      { key: 'cash', sign: 1 },
    ],
  },
  {
    id: 'liabilities_sum',
    labelDe: 'Verbindlichkeiten Summe',
    totalKey: 'liabilities_total',
    parts: [
      { key: 'bonds', sign: 1 },
      { key: 'bank_liabilities', sign: 1 },
      { key: 'advance_payments_received', sign: 1 },
      { key: 'trade_payables', sign: 1 },
      { key: 'notes_payable', sign: 1 },
      { key: 'affiliated_liabilities', sign: 1 },
      { key: 'associated_liabilities', sign: 1 },
      { key: 'shareholder_liabilities', sign: 1 },
      { key: 'unused_grants_liabilities', sign: 1 },
      { key: 'other_liabilities', sign: 1 },
    ],
  },
  {
    id: 'material_sum',
    labelDe: 'Materialaufwand Summe',
    totalKey: 'material_expenses_total',
    parts: [
      { key: 'material_raw_supplies', sign: 1 },
      { key: 'material_purchased_services', sign: 1 },
    ],
  },
  {
    id: 'personnel_sum',
    labelDe: 'Personalaufwand Summe',
    totalKey: 'personnel_expenses_total',
    parts: [
      { key: 'wages_salaries', sign: 1 },
      { key: 'social_security_pension', sign: 1 },
    ],
  },
  {
    id: 'income_chain',
    labelDe: 'GuV-Kette bis Ergebnis nach Steuern',
    totalKey: 'result_after_taxes',
    parts: [
      { key: 'revenue', sign: 1 },
      { key: 'change_in_work_in_progress', sign: 1 },
      { key: 'activated_own_work', sign: 1 },
      { key: 'other_operating_income', sign: 1 },
      { key: 'material_expenses_total', sign: -1 },
      { key: 'personnel_expenses_total', sign: -1 },
      { key: 'depreciation', sign: -1 },
      { key: 'other_operating_expenses', sign: -1 },
      { key: 'interest_income', sign: 1 },
      { key: 'interest_expense', sign: -1 },
      { key: 'income_taxes', sign: -1 },
    ],
  },
  {
    id: 'net_result_chain',
    labelDe: 'Ergebnis nach Steuern − sonstige Steuern = Jahresergebnis',
    totalKey: 'net_result',
    parts: [
      { key: 'result_after_taxes', sign: 1 },
      { key: 'other_taxes', sign: -1 },
    ],
  },
];

interface IdentityGroup {
  id: string;
  labelDe: string;
  lhsKey: string;
  rhsKey: string;
}

const IDENTITY_GROUPS: IdentityGroup[] = [
  {
    id: 'balance_sums_equal',
    labelDe: 'Bilanzsumme Aktiva = Passiva',
    lhsKey: 'total_assets',
    rhsKey: 'total_equity_and_liabilities',
  },
  {
    id: 'net_result_matches_balance',
    labelDe: 'Jahresergebnis GuV = Bilanz',
    lhsKey: 'net_result',
    rhsKey: 'net_result_balance',
  },
];

function close(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}

/** Per year: Aktiva = Passiva and the net result as reported in GuV and Bilanz. */
export function checkIdentities(
  lookup: AnalysisLookup,
  periodIds: string[],
  tolerance: number = DEFAULT_TOLERANCE,
): CheckFinding[] {
  const findings: CheckFinding[] = [];
  for (const group of IDENTITY_GROUPS) {
    for (const periodId of periodIds) {
      const lhs = lookup(group.lhsKey, periodId);
      const rhs = lookup(group.rhsKey, periodId);
      const base = { id: group.id, labelDe: group.labelDe, periodId };
      if (lhs === null || lhs === undefined || rhs === null || rhs === undefined) {
        findings.push({
          ...base,
          severity: 'skip',
          detailDe: `${periodId}: nicht prüfbar (Position fehlt).`,
        });
        continue;
      }
      if (close(lhs, rhs, tolerance)) {
        findings.push({
          ...base,
          severity: 'pass',
          detailDe: `${periodId}: ${formatAmount(lhs)} = ${formatAmount(rhs)}.`,
        });
      } else {
        findings.push({
          ...base,
          severity: 'fail',
          detailDe: `${periodId}: ${formatAmount(lhs)} vs. ${formatAmount(rhs)} (Differenz ${formatAmount(lhs - rhs)}).`,
        });
      }
    }
  }
  return findings;
}

/** Per year: each sub-total equals the sum of its components. */
export function checkSubTotals(
  lookup: AnalysisLookup,
  periodIds: string[],
  tolerance: number = DEFAULT_TOLERANCE,
): CheckFinding[] {
  const findings: CheckFinding[] = [];
  for (const group of SUBTOTAL_GROUPS) {
    for (const periodId of periodIds) {
      const base = { id: group.id, labelDe: group.labelDe, periodId };
      const total = lookup(group.totalKey, periodId);
      if (total === null || total === undefined) continue; // Position not in this schema/year.
      let sum = 0;
      let missing = false;
      for (const part of group.parts) {
        const value = lookup(part.key, periodId);
        if (value === null) {
          missing = true;
          break;
        }
        sum += part.sign * (value ?? 0); // A position the company never prints counts as 0.
      }
      if (missing) {
        findings.push({
          ...base,
          severity: 'skip',
          detailDe: `${periodId}: nicht prüfbar (Position fehlt).`,
        });
        continue;
      }
      if (close(total, sum, tolerance)) {
        findings.push({
          ...base,
          severity: 'pass',
          detailDe: `${periodId}: Summe ${formatAmount(sum)} = ${formatAmount(total)}.`,
        });
      } else {
        findings.push({
          ...base,
          severity: 'fail',
          detailDe: `${periodId}: Summe der Komponenten ${formatAmount(sum)} vs. ausgewiesener Wert ${formatAmount(total)} (Differenz ${formatAmount(sum - total)}).`,
        });
      }
    }
  }
  return findings;
}

/**
 * Compares the prior-year column of report N+1 with the own-year values of
 * report N. Deviations hint at extraction errors or reclassifications between
 * the two reports. Needs the raw extracts (`StoredDataset.reports`); the
 * merged dataset alone cannot show them any more.
 */
export function checkPriorYearConsistency(
  reports: RawReport[],
  tolerance: number = DEFAULT_TOLERANCE,
): CheckFinding[] {
  const findings: CheckFinding[] = [];
  const byPeriod = new Map(reports.map((report) => [report.periodId, report]));
  const sorted = [...reports].sort((a, b) => a.periodId.localeCompare(b.periodId));
  for (const report of sorted) {
    const year = Number(report.periodId);
    if (!Number.isFinite(year)) continue;
    const priorId = String(year - 1);
    const own = byPeriod.get(priorId);
    if (!own) continue; // The oldest report has no predecessor to compare with.
    let deviations = 0;
    for (const fact of report.facts) {
      const fromPriorColumn = fact.values[priorId];
      const ownFact = own.facts.find((f) => f.key === fact.key);
      const fromOwnYear = ownFact?.values[priorId];
      if (fromPriorColumn === null || fromPriorColumn === undefined) continue;
      if (fromOwnYear === null || fromOwnYear === undefined) continue;
      if (close(fromPriorColumn, fromOwnYear, tolerance)) continue;
      deviations += 1;
      findings.push({
        id: 'prior_year_values',
        labelDe: 'Vorjahreswerte (Bericht N+1 vs. Bericht N)',
        severity: 'warn',
        periodId: priorId,
        detailDe:
          `${fact.labelDe} (${priorId}): ${formatAmount(fromOwnYear)} im Bericht ${priorId} ` +
          `vs. ${formatAmount(fromPriorColumn)} in der Vorjahresspalte des Berichts ${report.periodId}.`,
      });
    }
    if (deviations === 0) {
      findings.push({
        id: 'prior_year_values',
        labelDe: 'Vorjahreswerte (Bericht N+1 vs. Bericht N)',
        severity: 'pass',
        periodId: priorId,
        detailDe: `Bericht ${report.periodId} vs. Bericht ${priorId}: Vorjahreswerte stimmen überein.`,
      });
    }
  }
  return findings;
}

/** Counts the findings and derives the green/amber/red verdict. */
export function summarize(findings: CheckFinding[]): CheckSummary {
  let passed = 0;
  let warned = 0;
  let failed = 0;
  let skipped = 0;
  for (const finding of findings) {
    if (finding.severity === 'pass') passed += 1;
    else if (finding.severity === 'warn') warned += 1;
    else if (finding.severity === 'fail') failed += 1;
    else skipped += 1;
  }
  const status: CheckSummary['status'] =
    failed > 0 ? 'red' : warned > 0 || passed === 0 ? 'amber' : 'green';
  return { status, findings, passed, warned, failed, skipped };
}

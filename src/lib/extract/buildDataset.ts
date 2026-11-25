/**
 * Builds a dataset (schema 0.4) out of one or more report extracts.
 *
 * One extract = one report year with its prior-year column. Several extracts
 * of the same company are merged into one multi-year dataset; overlapping
 * prior-year columns are cross-checked.
 */

import type { Check, Dataset, Fact, Note, Period, Redaction, SourceDoc } from '../../types';
import { readReportMeta, sortedPages, type ReportExtract, type ReportMeta } from './detect';
import { parseStatements } from './statements';

export interface ParsedReport {
  fileName: string;
  meta: ReportMeta;
  facts: Fact[];
  redactions: Redaction[];
  warnings: string[];
  unmatched: string[];
}

/** One uploaded extract, parsed on its own. */
export function parseReport(extract: ReportExtract, fileName: string): ParsedReport {
  const meta = readReportMeta(extract, fileName);
  const pages = sortedPages(extract);
  const warnings: string[] = [];
  const priorId = meta.periodId ? String(Number(meta.periodId) - 1) : null;

  const statements = parseStatements(pages, meta.periodId, priorId);
  warnings.push(...statements.warnings);

  return {
    fileName,
    meta,
    facts: statements.facts,
    redactions: [],
    warnings,
    unmatched: statements.unmatched,
  };
}

/**
 * The reports behind one stored dataset plus newly uploaded ones, ready to be
 * rebuilt with `buildDataset`. A new report replaces the stored report of the
 * same year (the re-uploaded year wins entirely, no leftovers of the old one).
 */
/**
 * Reconciliation checks over the statement figures. A check only lands in a
 * dataset when the company's schema has every position it references – a
 * position the company never prints (no fact in any year) is no gap to flag,
 * and the validation treats a missing figure as a skip, not a zero.
 */
const CHECKS: Check[] = [
  { id: 'balance_sums_equal', labelDe: 'Bilanzsumme Aktiva = Passiva', lhs: 'total_assets', rhs: 'total_equity_and_liabilities', views: ['balance'] },
  { id: 'assets_composition', labelDe: 'Anlage- + Umlaufvermögen + RAP = Bilanzsumme', lhs: 'fixed_assets_total + current_assets_total + prepaid_expenses', rhs: 'total_assets', views: ['balance'] },
  { id: 'liabilities_composition', labelDe: 'Eigenkapital + Sonderposten + Rückstellungen + Verbindlichkeiten = Bilanzsumme', lhs: 'equity_total + special_item_grants + provisions_total + liabilities_total', rhs: 'total_equity_and_liabilities', views: ['balance'] },
  { id: 'fixed_assets_sum', labelDe: 'Immaterielle + Sachanlagen = Anlagevermögen', lhs: 'intangible_assets + tangible_assets_total', rhs: 'fixed_assets_total', views: ['balance'] },
  { id: 'equity_composition', labelDe: 'Eigenkapital = Kapital + Rücklage + Jahresergebnis', lhs: 'subscribed_capital + capital_reserve + net_result_balance', rhs: 'equity_total', views: ['balance'] },
  { id: 'tangible_assets_sum', labelDe: 'Sachanlagen Summe', lhs: 'land_buildings + technical_equipment + other_equipment + construction_in_progress', rhs: 'tangible_assets_total', views: ['balance'] },
  { id: 'inventories_sum', labelDe: 'Vorräte Summe', lhs: 'raw_materials + work_in_progress + inventory_advance_payments', rhs: 'inventories_total', views: ['balance'] },
  { id: 'receivables_sum', labelDe: 'Forderungen Summe', lhs: 'trade_receivables + grantor_receivables + shareholder_receivables + other_assets', rhs: 'receivables_total', views: ['balance'] },
  { id: 'current_assets_sum', labelDe: 'Umlaufvermögen Summe', lhs: 'inventories_total + receivables_total + cash', rhs: 'current_assets_total', views: ['balance'] },
  { id: 'liabilities_sum', labelDe: 'Verbindlichkeiten Summe', lhs: 'bank_liabilities + advance_payments_received + trade_payables + unused_grants_liabilities + other_liabilities', rhs: 'liabilities_total', views: ['balance'] },
  { id: 'material_sum', labelDe: 'Materialaufwand Summe', lhs: 'material_raw_supplies + material_purchased_services', rhs: 'material_expenses_total', views: ['income'] },
  { id: 'personnel_sum', labelDe: 'Personalaufwand Summe', lhs: 'wages_salaries + social_security_pension', rhs: 'personnel_expenses_total', views: ['income'] },
  { id: 'income_chain', labelDe: 'GuV-Kette bis Ergebnis nach Steuern', lhs: 'revenue + change_in_work_in_progress + other_operating_income - material_expenses_total - personnel_expenses_total - depreciation - other_operating_expenses + interest_income - interest_expense - income_taxes', rhs: 'result_after_taxes', views: ['income'] },
  { id: 'net_result_chain', labelDe: 'Ergebnis nach Steuern und sonstige Steuern = Jahresergebnis', lhs: 'abs(result_after_taxes - net_result)', rhs: 'abs(other_taxes)', views: ['income'] },
  { id: 'net_result_matches_balance', labelDe: 'Jahresergebnis GuV = Bilanz', lhs: 'net_result', rhs: 'net_result_balance', views: ['balance', 'income'] },
];

/** The keys a formula references ("total_assets + abs(prepaid_expenses)" -> the two). */
function formulaKeys(formula: string): string[] {
  return (formula.match(/[a-z][a-z0-9_]*/g) ?? []).filter((k) => k !== 'abs' && k !== 'prev');
}

export function combineReports(existing: ParsedReport[] | undefined, incoming: ParsedReport[]): ParsedReport[] {
  const replaced = new Set(incoming.map((r) => r.meta.periodId));
  return [...(existing ?? []).filter((r) => !replaced.has(r.meta.periodId)), ...incoming];
}

export interface MergeResult {
  dataset: Dataset;
  warnings: string[];
}

/**
 * Merges several reports of one company into a single multi-year dataset.
 * Report Y contributes its own year and the prior-year column for Y-1; when two
 * reports print different figures for the same year, the later report wins and
 * the difference is reported.
 */
export function buildDataset(reports: ParsedReport[]): MergeResult {
  const warnings: string[] = [];
  if (reports.length === 0) throw new Error('Keine Berichte ausgewählt');

  const sorted = [...reports].sort((a, b) => a.meta.periodId.localeCompare(b.meta.periodId));
  const latest = sorted[sorted.length - 1].meta;
  const entityName = latest.entityName;
  const formerNames = sorted
    .map((r) => r.meta.entityName)
    .filter((name, i, all) => name !== entityName && all.indexOf(name) === i)
    .map((name) => ({ name }));

  const periods = new Map<string, Period>();
  const facts = new Map<string, Fact>();
  const sources: SourceDoc[] = [];
  const redactions: Redaction[] = [];
  const notes: Note[] = [];

  /**
   * The report of year P is the reference for P; its prior-year column only
   * fills gaps and is compared against the figure the older report prints.
   */
  const putValue = (fact: Fact, periodId: string, value: number | null, own: boolean, origin: string) => {
    const existing = fact.values[periodId];
    if (existing === undefined) {
      fact.values[periodId] = value;
      return;
    }
    if (value === null || existing === null) {
      if (existing === null && value !== null) fact.values[periodId] = value;
      return;
    }
    if (Math.abs(existing - value) <= 0.05) return;
    if (own) {
      warnings.push(
        `Abweichung für ${fact.key} (${periodId}): ${existing} aus einem früheren Bericht, ${value} aus ${origin}. Es gilt der Bericht des Geschäftsjahres.`,
      );
      fact.values[periodId] = value;
    } else {
      warnings.push(
        `Vorjahres-Spalte ${periodId} von ${fact.key}: ${existing} (Bericht ${periodId}) weicht ab von ${value} (Bericht ${origin}).`,
      );
    }
  };

  for (const report of sorted) {
    const { meta } = report;
    periods.set(meta.periodId, {
      id: meta.periodId,
      start: `${meta.periodId}-01-01`,
      end: `${meta.periodId}-12-31`,
    });
    // The prior-year column of the oldest report keeps its year as a
    // comparison-only period (it has no report of its own).
    const priorId = String(Number(meta.periodId) - 1);
    if (!periods.has(priorId)) {
      periods.set(priorId, {
        id: priorId,
        start: `${priorId}-01-01`,
        end: `${priorId}-12-31`,
        comparisonOnly: true,
      });
    }
    sources.push({
      period: meta.periodId,
      title: meta.title,
      url: meta.sourceUrl,
      pagesUsed: 'Bilanz, Gewinn- und Verlustrechnung',
      extraction: meta.extraction,
      verified: false,
    });

    for (const fact of report.facts) {
      const existing = facts.get(fact.key);
      const target =
        existing ??
        (() => {
          const created: Fact = { ...fact, values: {} };
          facts.set(fact.key, created);
          return created;
        })();
      for (const [periodId, value] of Object.entries(fact.values)) {
        putValue(target, periodId, value ?? null, periodId === meta.periodId, meta.periodId);
      }
    }

    for (const redaction of report.redactions) redactions.push(redaction);
  }

  // Periods that only appear as a prior-year column stay comparison-only.
  const reported = new Set([...periods.keys()]);
  for (const fact of facts.values()) {
    for (const periodId of Object.keys(fact.values)) {
      if (periods.has(periodId)) continue;
      periods.set(periodId, {
        id: periodId,
        start: `${periodId}-01-01`,
        end: `${periodId}-12-31`,
        comparisonOnly: true,
      });
    }
  }

  const periodList = [...periods.values()].sort((a, b) => a.id.localeCompare(b.id));
  for (const period of periodList) {
    if (!reported.has(period.id)) period.comparisonOnly = true;
  }

  const dataset: Dataset = {
    schemaVersion: '0.4',
    entity: {
      id: entityName
        .toLowerCase()
        .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c] as string)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
      name: entityName,
      seat: latest.entitySeat,
      formerNames: formerNames.length > 0 ? formerNames : undefined,
    },
    sources,
    periods: periodList,
    conventions: {
      currency: 'EUR',
      tolerance: 0.05,
      signs: 'Erfolgswirksame Größen mit ökonomischem Vorzeichen (Verlust negativ).',
      nullMeaning: 'null = im Bericht nicht ausgewiesen oder geschwärzt',
    },
    statements: {
      balance_assets: { labelDe: 'Aktiva' },
      balance_liabilities: { labelDe: 'Passiva' },
      income: { labelDe: 'Gewinn- und Verlustrechnung' },
    },
    views: [
      {
        id: 'balance',
        labelDe: 'Bilanz',
        sourceDe: 'Bilanz (Anlage 1) und Angaben zur Bilanz',
        statements: ['balance_assets', 'balance_liabilities'],
      },
      {
        id: 'income',
        labelDe: 'Gewinn- und Verlustrechnung',
        sourceDe: 'Gewinn- und Verlustrechnung (Anlage 2)',
        statements: ['income'],
      },
    ],
    facts: [...facts.values()],
    derivedKpis: [
      { key: 'equity_ratio', labelDe: 'Eigenkapitalquote', formula: 'equity_total / total_assets', unit: 'ratio' },
      { key: 'fixed_assets_ratio', labelDe: 'Anlageintensität', formula: 'fixed_assets_total / total_assets', unit: 'ratio' },
    ],
    checks: CHECKS.filter((c) => {
      const keys = [...formulaKeys(c.lhs), ...formulaKeys(c.rhs)];
      return keys.every((k) => facts.has(k));
    }),
    notes: notes.length > 0 ? notes : undefined,
    redactions: redactions.length > 0 ? redactions : undefined,
  };

  return { dataset, warnings };
}

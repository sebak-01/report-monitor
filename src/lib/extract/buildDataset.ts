/**
 * Builds a dataset (schema 0.4) out of one or more report extracts.
 *
 * One extract = one report year with its prior-year column. Several extracts
 * of the same company are merged into one multi-year dataset; overlapping
 * prior-year columns are cross-checked.
 */

import type { Dataset, Fact, Note, Period, Redaction, Schedule, ScheduleRow, SourceDoc } from '../../types';
import { findAnlagespiegelPage, parseAnlagespiegel } from './anlagespiegel';
import { readReportMeta, sortedPages, type ReportExtract, type ReportMeta } from './detect';
import { parseStatements } from './statements';

export interface ParsedReport {
  fileName: string;
  meta: ReportMeta;
  facts: Fact[];
  schedule: Schedule | null;
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

    let schedule: Schedule | null = null;
    const redactions: Redaction[] = [];
    const anlagePage = findAnlagespiegelPage(pages);
    if (anlagePage) {
      const parsed = parseAnlagespiegel(anlagePage.text, meta.periodId, anlagePage.page_number);
      warnings.push(...parsed.warnings);
      schedule = parsed.schedule;
      const printed =
        schedule?.rows.some(
          (r) => r.values[meta.periodId] && Object.values(r.values[meta.periodId]).some((v) => v !== null),
        ) ?? false;
      if (!schedule) {
        // already reported in the warnings
      } else if (!printed) {
        redactions.push({
          view: 'anlagespiegel',
          kind: 'redacted',
          periods: [meta.periodId],
          page: anlagePage.page_number,
          labelDe: 'Anlagespiegel',
          detailDe:
            'Der Anlagespiegel ist im veröffentlichten Bericht nicht lesbar (Zahlen geschwärzt oder nicht im Text). Die Buchwerte stehen in der Bilanz.',
        });
        schedule = { ...schedule, rows: schedule.rows.map((r) => ({ ...r, values: {} })) };
      } else {
        // The book values of the schedule are the balance-sheet line items.
        backfillFromSchedule(statements.facts, schedule, meta.periodId);
      }
    }

  return {
    fileName,
    meta,
    facts: statements.facts,
    schedule,
    redactions,
    warnings,
    unmatched: statements.unmatched,
  };
}

/**
 * The Anlagespiegel prints the book values per asset item — the same figures
 * the Bilanz shows as its Anlagevermögen lines. Figures the statement matcher
 * could not read (wrapped labels, two columns on one line) are taken from there.
 */
function backfillFromSchedule(facts: Fact[], schedule: Schedule, periodId: string): void {
  const byKey = new Map(facts.map((f) => [f.key, f]));
  const rows = schedule.rows;
  const findRow = (pattern: RegExp) => rows.find((r) => pattern.test(r.labelDe));
  const book = (row: ScheduleRow | undefined) => {
    const cells = row?.values[periodId];
    if (!cells) return null;
    const value = cells['book-value'] ?? cells['book-value-prior'];
    return value ?? null;
  };

  const table: { key: string; row: RegExp }[] = [
    { key: 'intangible_licenses', row: /entgeltlich erworbene|Konzessionen/ },
    { key: 'goodwill', row: /Geschäfts- oder Firmenwert/ },
    { key: 'intangible_advances', row: /geleistete Anzahlungen\s*$/i },
    { key: 'land_buildings', row: /Grundst.ck/ },
    { key: 'technical_equipment', row: /Technische Anlagen|Tech\. Anl/ },
    { key: 'other_equipment', row: /andere Anlagen|Betriebs-/ },
    { key: 'construction_in_progress', row: /Anlagen im Bau/ },
    { key: 'intangible_assets', row: /Summe Immaterielle/ },
    { key: 'tangible_assets_total', row: /Summe Sachanlagen/ },
    { key: 'fixed_assets_total', row: /Summe Anlageverm/ },
  ];
  for (const { key, row } of table) {
    const value = book(findRow(row));
    if (value === null || value === undefined) continue;
    const fact = byKey.get(key);
    if (fact) {
      if (fact.values[periodId] === undefined || fact.values[periodId] === null) fact.values[periodId] = value;
    } else {
      facts.push({
        key,
        statement: 'balance_assets',
        labelDe: findRow(row)!.labelDe.replace(/^\S*\s*/, ''),
        unit: 'EUR',
        values: { [periodId]: value },
      });
    }
  }
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
  const schedules = new Map<string, Schedule>();
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
      pagesUsed: 'Bilanz, Gewinn- und Verlustrechnung, Anlagespiegel',
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

    if (report.schedule) {
      const existing = schedules.get(report.schedule.id);
      if (!existing) {
        schedules.set(report.schedule.id, JSON.parse(JSON.stringify(report.schedule)) as Schedule);
      } else {
        for (const row of report.schedule.rows) {
          const target = existing.rows.find((r) => r.key === row.key) ?? existing.rows.find((r) => r.labelDe === row.labelDe);
          if (!target) {
            existing.rows.push(JSON.parse(JSON.stringify(row)) as ScheduleRow);
            continue;
          }
          for (const [periodId, cells] of Object.entries(row.values)) {
            if (!target.values[periodId]) {
              target.values[periodId] = cells;
              continue;
            }
            for (const [col, value] of Object.entries(cells)) {
              const known = target.values[periodId][col];
              if (known === undefined || known === null) target.values[periodId][col] = value;
              else if (value !== null && Math.abs(known - value) > 0.05) {
                warnings.push(`Abweichung Anlagespiegel ${row.labelDe} (${periodId}, ${col}): ${known} vs. ${value}.`);
              }
            }
          }
        }
        // Columns of later reports can add new ones (e.g. "Zuschreibung").
        for (const col of report.schedule.columns) {
          if (!existing.columns.some((c) => c.key === col.key)) existing.columns.push(col);
        }
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

  const scheduleList = [...schedules.values()];
  const hasSchedule = scheduleList.length > 0;
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
      anlagespiegel: { labelDe: 'Anlagespiegel' },
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
      ...(hasSchedule
        ? [
            {
              id: 'anlagespiegel',
              labelDe: 'Anlagespiegel',
              sourceDe: 'Anhang, Entwicklung des Anlagevermögens',
              statements: [] as string[],
              schedules: scheduleList.map((s) => s.id),
            },
          ]
        : []),
    ],
    facts: [...facts.values()],
    schedules: hasSchedule ? scheduleList : undefined,
    derivedKpis: [
      { key: 'equity_ratio', labelDe: 'Eigenkapitalquote', formula: 'equity_total / total_assets', unit: 'ratio' },
      { key: 'fixed_assets_ratio', labelDe: 'Anlageintensität', formula: 'fixed_assets_total / total_assets', unit: 'ratio' },
    ],
    checks: [
      { id: 'balance_sums_equal', labelDe: 'Bilanzsumme Aktiva = Passiva', lhs: 'total_assets', rhs: 'total_equity_and_liabilities', views: ['balance'] },
      { id: 'assets_composition', labelDe: 'Anlage- + Umlaufvermögen + RAP = Bilanzsumme', lhs: 'fixed_assets_total + current_assets_total + prepaid_expenses', rhs: 'total_assets', views: ['balance'] },
      { id: 'liabilities_composition', labelDe: 'Eigenkapital + Sonderposten + Rückstellungen + Verbindlichkeiten = Bilanzsumme', lhs: 'equity_total + special_item_grants + provisions_total + liabilities_total', rhs: 'total_equity_and_liabilities', views: ['balance'] },
      { id: 'fixed_assets_sum', labelDe: 'Immaterielle + Sachanlagen = Anlagevermögen', lhs: 'intangible_assets + tangible_assets_total', rhs: 'fixed_assets_total', views: ['balance'] },
      { id: 'equity_composition', labelDe: 'Eigenkapital = Kapital + Rücklage + Jahresergebnis', lhs: 'subscribed_capital + capital_reserve + net_result_balance', rhs: 'equity_total', views: ['balance'] },
      { id: 'net_result_consistent', labelDe: 'Jahresergebnis = Ergebnis in der Bilanz', lhs: 'net_result', rhs: 'net_result_balance', views: ['income'] },
    ],
    notes: notes.length > 0 ? notes : undefined,
    redactions: redactions.length > 0 ? redactions : undefined,
  };

  return { dataset, warnings };
}

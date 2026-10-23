import type { Dataset, Fact, Period, Unit } from '../../types';
import { detectNumberFormat, parseNumber, type Cell, type NumberFormat } from './numbers';

/** One table of an uploaded file (a sheet, or the whole CSV / JSON array). */
export interface RawTable {
  name: string;
  rows: Cell[][];
}

export type Layout = 'wide' | 'long';

export interface Mapping {
  /** wide: one row per line item, one column per year. long: one row per (item, year, value). */
  layout: Layout;
  /** Index of the header row; data starts below it. */
  headerRow: number;
  labelCol: number;
  /** wide: the columns that hold a year, with the year they stand for. */
  periodCols: { col: number; periodId: string }[];
  /** long: the columns with the year and the value. */
  periodCol: number;
  valueCol: number;
  unit: Unit;
  /** `auto` detects the notation from the data. */
  numberFormat: NumberFormat | 'auto';
}

export interface DatasetMeta {
  entityName: string;
  title: string;
}

export interface BuildResult {
  dataset: Dataset | null;
  errors: string[];
  warnings: string[];
  /** The notation that was used (after auto-detection). */
  numberFormat: NumberFormat;
}

const LABEL_HEADER = /bezeichnung|position|posten|name|label|kennzahl|beschreibung|item|konto|zeile/i;
const PERIOD_HEADER = /jahr|year|periode|period|gj|zeitraum/i;
const VALUE_HEADER = /wert|value|betrag|amount|summe/i;

export const UNITS: Unit[] = ['EUR', 'TEUR', 'count', 'pct'];

/** "2023", "GJ 2023", 2023, "31.12.2023" -> "2023"; anything without a plausible year -> null. */
export function extractPeriodId(header: Cell | undefined): string | null {
  if (header === null || header === undefined) return null;
  const text = String(header);
  const match = text.match(/(?<!\d)(19|20)\d{2}(?!\d)/);
  return match ? match[0] : null;
}

function isEmpty(cell: Cell | undefined): boolean {
  return cell === null || cell === undefined || (typeof cell === 'string' && cell.trim() === '');
}

export function columnCount(table: RawTable): number {
  return table.rows.reduce((max, row) => Math.max(max, row.length), 0);
}

/** "A", "B", ..., "AA" */
export function columnName(index: number): string {
  let n = index;
  let name = '';
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

/** Looks at the table and proposes a mapping the user can correct. */
export function guessMapping(table: RawTable): Mapping {
  const headerRow = Math.max(
    0,
    table.rows.findIndex((row) => row.filter((c) => !isEmpty(c)).length >= 2),
  );
  const header = table.rows[headerRow] ?? [];
  const width = columnCount(table);

  const yearCols: { col: number; periodId: string }[] = [];
  header.forEach((cell, col) => {
    const periodId = extractPeriodId(cell);
    // A header that is only a year (or "GJ 2023") counts; a long text that happens to contain a year does not.
    if (periodId && String(cell).trim().length <= 14) yearCols.push({ col, periodId });
  });

  const periodCol = header.findIndex((c) => PERIOD_HEADER.test(String(c ?? '')));
  const valueCol = header.findIndex((c, i) => i !== periodCol && VALUE_HEADER.test(String(c ?? '')));
  const isLong = yearCols.length < 2 && periodCol >= 0 && valueCol >= 0;

  const yearColIndexes = new Set(yearCols.map((y) => y.col));
  let labelCol = header.findIndex((c, i) => LABEL_HEADER.test(String(c ?? '')) && !yearColIndexes.has(i));
  if (labelCol < 0) {
    labelCol = Array.from({ length: width }, (_, i) => i).find((i) => !yearColIndexes.has(i)) ?? 0;
  }

  const sample = table.rows
    .slice(headerRow + 1, headerRow + 200)
    .flatMap((row) => (isLong ? [row[valueCol]] : yearCols.map((y) => row[y.col])));

  return {
    layout: isLong ? 'long' : 'wide',
    headerRow,
    labelCol,
    periodCols: yearCols.filter((y) => y.col !== labelCol),
    periodCol: periodCol >= 0 ? periodCol : Math.min(1, Math.max(0, width - 1)),
    valueCol: valueCol >= 0 ? valueCol : Math.min(2, Math.max(0, width - 1)),
    unit: 'EUR',
    numberFormat: detectNumberFormat(sample),
  };
}

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'ae', Ö: 'oe', Ü: 'ue' };

/** "Umsatzerlöse (netto)" -> "umsatzerloese_netto" */
export function slugify(text: string): string {
  return text
    .replace(/[äöüßÄÖÜ]/g, (c) => UMLAUTS[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

class FactBook {
  readonly facts: Fact[] = [];
  private readonly keys = new Set<string>();
  private readonly byLabel = new Map<string, Fact>();

  constructor(private readonly unit: Unit) {}

  get(label: string): Fact {
    const existing = this.byLabel.get(label);
    if (existing) return existing;
    const base = slugify(label) || `row_${this.facts.length + 1}`;
    let key = base;
    for (let n = 2; this.keys.has(key); n += 1) key = `${base}_${n}`;
    this.keys.add(key);
    const fact: Fact = { key, statement: 'data', labelDe: label, unit: this.unit, values: {} };
    this.facts.push(fact);
    this.byLabel.set(label, fact);
    return fact;
  }
}

function periodOf(id: string): Period {
  return { id, start: `${id}-01-01`, end: `${id}-12-31` };
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Turns a table and a mapping into a dataset (no checks, one generic view). */
export function buildUploadDataset(table: RawTable, mapping: Mapping, meta: DatasetMeta): BuildResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rows = table.rows.slice(mapping.headerRow + 1);

  const valueCells =
    mapping.layout === 'wide'
      ? rows.flatMap((row) => mapping.periodCols.map((p) => row[p.col]))
      : rows.map((row) => row[mapping.valueCol]);
  const numberFormat = mapping.numberFormat === 'auto' ? detectNumberFormat(valueCells) : mapping.numberFormat;

  const book = new FactBook(mapping.unit);
  const periodIds = new Set<string>();
  let invalid = 0;
  const invalidExamples: string[] = [];
  let headingRows = 0;
  let unlabeled = 0;
  let overwritten = 0;

  const store = (fact: Fact, periodId: string, cell: Cell | undefined) => {
    const parsed = parseNumber(cell, numberFormat);
    let value: number | null;
    if (parsed === undefined) {
      invalid += 1;
      if (invalidExamples.length < 3) invalidExamples.push(`"${String(cell)}"`);
      value = null;
    } else {
      value = parsed;
    }
    if (periodId in fact.values && fact.values[periodId] !== null && value !== null) overwritten += 1;
    if (!(periodId in fact.values) || value !== null) fact.values[periodId] = value;
    periodIds.add(periodId);
  };

  if (mapping.layout === 'wide') {
    const seen = new Set<string>();
    for (const { col, periodId } of mapping.periodCols) {
      if (!/^(19|20)\d{2}$/.test(periodId)) {
        errors.push(`Spalte ${columnName(col)}: Es wurde kein Geschäftsjahr erkannt.`);
      } else if (seen.has(periodId)) {
        errors.push(`Das Geschäftsjahr ${periodId} ist mehreren Spalten zugeordnet.`);
      }
      seen.add(periodId);
    }
    if (mapping.periodCols.length === 0) errors.push('Es ist keine Spalte mit Geschäftsjahren ausgewählt.');
    if (mapping.periodCols.some((p) => p.col === mapping.labelCol)) {
      errors.push('Die Bezeichnungsspalte kann nicht gleichzeitig eine Jahresspalte sein.');
    }
    if (errors.length === 0) {
      for (const row of rows) {
        if (row.every(isEmpty)) continue;
        const label = String(row[mapping.labelCol] ?? '').trim();
        const hasValues = mapping.periodCols.some((p) => !isEmpty(row[p.col]));
        if (label === '') {
          if (hasValues) unlabeled += 1;
          continue;
        }
        if (!hasValues) {
          headingRows += 1; // a section heading, e.g. "A. Anlagevermögen" without figures
          continue;
        }
        const fact = book.get(label);
        for (const { col, periodId } of mapping.periodCols) store(fact, periodId, row[col]);
      }
    }
  } else {
    if (new Set([mapping.labelCol, mapping.periodCol, mapping.valueCol]).size < 3) {
      errors.push('Bezeichnung, Jahr und Wert müssen drei verschiedene Spalten sein.');
    } else {
      for (const row of rows) {
        if (row.every(isEmpty)) continue;
        const label = String(row[mapping.labelCol] ?? '').trim();
        const periodId = extractPeriodId(row[mapping.periodCol]);
        if (label === '' || periodId === null) {
          unlabeled += 1;
          continue;
        }
        store(book.get(label), periodId, row[mapping.valueCol]);
      }
    }
  }

  if (errors.length === 0 && book.facts.length === 0) errors.push('In der Tabelle wurden keine Zahlenzeilen gefunden.');

  if (invalid > 0) {
    warnings.push(
      `${invalid} ${plural(invalid, 'Zelle enthält', 'Zellen enthalten')} keinen lesbaren Zahlenwert (z. B. ${invalidExamples.join(', ')}) und ${plural(invalid, 'wird', 'werden')} als „keine Angabe“ übernommen.`,
    );
  }
  if (unlabeled > 0) {
    warnings.push(`${unlabeled} ${plural(unlabeled, 'Zeile hat', 'Zeilen haben')} keine Bezeichnung oder kein Jahr und ${plural(unlabeled, 'wurde', 'wurden')} übersprungen.`);
  }
  if (overwritten > 0) {
    warnings.push(`${overwritten} ${plural(overwritten, 'Wert wurde', 'Werte wurden')} überschrieben, weil Bezeichnung und Jahr mehrfach vorkommen.`);
  }
  if (headingRows > 0) {
    warnings.push(`${headingRows} ${plural(headingRows, 'Zeile ohne Zahlen gilt', 'Zeilen ohne Zahlen gelten')} als Überschrift und ${plural(headingRows, 'wird', 'werden')} nicht übernommen.`);
  }

  if (errors.length > 0) return { dataset: null, errors, warnings, numberFormat };

  const ids = [...periodIds].sort();
  for (const fact of book.facts) for (const id of ids) if (!(id in fact.values)) fact.values[id] = null;
  const name = meta.entityName.trim() || meta.title;

  const dataset: Dataset = {
    schemaVersion: '0.3',
    entity: { id: slugify(name) || 'upload', name },
    sources: ids.map((period) => ({ period, title: meta.title, extraction: 'upload', verified: false })),
    periods: ids.map(periodOf),
    conventions: {
      currency: 'EUR',
      tolerance: 0.01,
      nullMeaning: 'null = no value in the uploaded file',
    },
    statements: { data: { labelDe: 'Hochgeladene Daten' } },
    views: [{ id: 'data', labelDe: 'Daten', sourceDe: meta.title, statements: ['data'] }],
    facts: book.facts,
    derivedKpis: [],
    checks: [],
  };
  return { dataset, errors, warnings, numberFormat };
}

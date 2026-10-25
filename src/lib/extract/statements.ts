/**
 * Reads the printed figures of the Bilanz and the Gewinn- und Verlustrechnung
 * out of a report's text layer, by matching one label pattern per figure —
 * the approach of the pilot tooling `tools/extract_statements.py`.
 *
 * Amounts are taken from the matching line, after the label (a line can carry
 * two statements side by side), or from the line below when the label wraps.
 * Figures the layout does not have are simply missing; group totals printed as
 * bare amount lines are summed up from their items.
 */

import type { Emphasis, Fact, Unit } from '../../types';
import { amountSpans, pair } from './numbers';
import { rowsFromText } from './rows';

export interface FactSpec {
  key: string;
  statement: string;
  labelDe: string;
  /** Label patterns; the first figure found in the report wins. */
  patterns: RegExp[];
  parentKey?: string;
  numberLabel?: string;
  emphasis?: Emphasis;
  unit?: Unit;
  /** Results keep the economic sign: a loss is negative regardless of how it prints. */
  result?: boolean;
  /** Fallback: sum of these keys when the report prints no total of its own. */
  sumOf?: string[];
  /** The printed group total sits on the next bare amount line after this pattern. */
  bareTotalAfter?: RegExp;
  /** Only match lines within this many lines after a line matching the anchor. */
  after?: { anchor: RegExp; within?: number };
  /** Lines that carry this are no rows of the figure (e.g. "Entnahmen aus der Kapitalrücklage" in the GuV). */
  exclude?: RegExp;
}

export const FACT_SPECS: FactSpec[] = [
  // ---------------------------------------------------------------- Aktiva
  { key: 'fixed_assets_total', statement: 'balance_assets', labelDe: 'Anlagevermögen', patterns: [/Summe Anlageverm/i], emphasis: 'total', numberLabel: 'A.', sumOf: ['intangible_assets', 'tangible_assets_total'] },
  { key: 'intangible_assets', statement: 'balance_assets', labelDe: 'Immaterielle Vermögensgegenstände', patterns: [/sowie Lizenzen an solchen Rechten und Werten/i, /Rechten und Werten\s/i, /Immaterielle Vermögensgegenständ/i], parentKey: 'fixed_assets_total', numberLabel: 'I.', sumOf: ['intangible_licenses', 'goodwill', 'intangible_advances'] },
  { key: 'intangible_licenses', statement: 'balance_assets', labelDe: 'Entgeltlich erworbene Konzessionen, gewerbliche Schutzrechte und Lizenzen', patterns: [/entgeltlich erworbene Konzessionen/i, /Konzessionen, gewerb/i], parentKey: 'intangible_assets', numberLabel: '1.' },
  { key: 'goodwill', statement: 'balance_assets', labelDe: 'Geschäfts- oder Firmenwert', patterns: [/Geschäfts- oder Firmenwert/], parentKey: 'intangible_assets', numberLabel: '2.' },
  { key: 'intangible_advances', statement: 'balance_assets', labelDe: 'Geleistete Anzahlungen (immateriell)', patterns: [/geleistete Anzahlungen/i], parentKey: 'intangible_assets', numberLabel: '3.', after: { anchor: /Immaterielle Vermögensgegenst/i, within: 3 } },
  { key: 'tangible_assets_total', statement: 'balance_assets', labelDe: 'Sachanlagen', patterns: [/Summe Sachanlagen/i], emphasis: 'subtotal', numberLabel: 'II.', parentKey: 'fixed_assets_total', sumOf: ['land_buildings', 'technical_equipment', 'other_equipment', 'construction_in_progress'] },
  { key: 'land_buildings', statement: 'balance_assets', labelDe: 'Grundstücke, grundstücksgleiche Rechte und Bauten', patterns: [/einschließlich der Bauten auf fremden/i], parentKey: 'tangible_assets_total', numberLabel: '1.' },
  { key: 'technical_equipment', statement: 'balance_assets', labelDe: 'Technische Anlagen und Maschinen', patterns: [/Technische Anlagen und Maschinen/i, /Tech\. Anl/], parentKey: 'tangible_assets_total', numberLabel: '2.' },
  { key: 'other_equipment', statement: 'balance_assets', labelDe: 'Andere Anlagen, Betriebs- und Geschäftsausstattung', patterns: [/andere Anlagen, Betriebs/i], parentKey: 'tangible_assets_total', numberLabel: '3.' },
  { key: 'construction_in_progress', statement: 'balance_assets', labelDe: 'Geleistete Anzahlungen und Anlagen im Bau', patterns: [/Anzahlungen und Anlagen im Bau/i], parentKey: 'tangible_assets_total', numberLabel: '4.' },
  { key: 'current_assets_total', statement: 'balance_assets', labelDe: 'Umlaufvermögen', patterns: [/Summe Umlaufverm/i], emphasis: 'total', numberLabel: 'B.', sumOf: ['inventories_total', 'receivables_total', 'cash'] },
  { key: 'inventories_total', statement: 'balance_assets', labelDe: 'Vorräte', patterns: [/Vorräte\s+(?=[\d(])/, /Vorräte\s*$/i], parentKey: 'current_assets_total', numberLabel: 'I.', emphasis: 'subtotal', sumOf: ['raw_materials', 'work_in_progress', 'inventory_advance_payments'] },
  { key: 'raw_materials', statement: 'balance_assets', labelDe: 'Roh-, Hilfs- und Betriebsstoffe', patterns: [/Roh-, Hilfs/i], parentKey: 'inventories_total', numberLabel: '1.' },
  { key: 'work_in_progress', statement: 'balance_assets', labelDe: 'Unfertige Erzeugnisse, unfertige Leistungen', patterns: [/unfertige Erzeugnisse/i, /In Arbeit befindliche/i], parentKey: 'inventories_total', numberLabel: '2.' },
  { key: 'inventory_advance_payments', statement: 'balance_assets', labelDe: 'Geleistete Anzahlungen (Vorräte)', patterns: [/geleistete Anzahlungen/i], parentKey: 'inventories_total', numberLabel: '3.', after: { anchor: /Vorräte/i, within: 6 } },
  { key: 'receivables_total', statement: 'balance_assets', labelDe: 'Forderungen und sonstige Vermögensgegenstände', patterns: [/Summe der Forderungen/, /Forderungen und sonstige Vermögensgegen/i], parentKey: 'current_assets_total', numberLabel: 'II.', emphasis: 'subtotal', sumOf: ['trade_receivables', 'grantor_receivables', 'shareholder_receivables', 'other_assets'] },
  { key: 'trade_receivables', statement: 'balance_assets', labelDe: 'Forderungen aus Lieferungen und Leistungen', patterns: [/Forderungen aus Lieferungen/i], parentKey: 'receivables_total', numberLabel: '1.' },
  { key: 'grantor_receivables', statement: 'balance_assets', labelDe: 'Forderungen an Zuschussgeber', patterns: [/Forderungen an Zuschussgeber/i], parentKey: 'receivables_total', numberLabel: '2.' },
  { key: 'shareholder_receivables', statement: 'balance_assets', labelDe: 'Forderungen gegen Gesellschafter', patterns: [/Forderungen gegen Gesellschafter/i], parentKey: 'receivables_total' },
  { key: 'other_assets', statement: 'balance_assets', labelDe: 'Sonstige Vermögensgegenstände', patterns: [/sonstige Vermögensgegen/i], parentKey: 'receivables_total' },
  { key: 'cash', statement: 'balance_assets', labelDe: 'Kassenbestand, Guthaben bei Kreditinstituten', patterns: [/Kassenbestand/i], parentKey: 'current_assets_total', numberLabel: 'III.' },
  { key: 'prepaid_expenses', statement: 'balance_assets', labelDe: 'Rechnungsabgrenzungsposten', patterns: [/Rechnungsabgrenzung/i], numberLabel: 'C.' },
  { key: 'total_assets', statement: 'balance_assets', labelDe: 'Bilanzsumme', patterns: [], emphasis: 'total' },

  // ------------------------------------------------------------- Passiva
  { key: 'subscribed_capital', statement: 'balance_liabilities', labelDe: 'Gezeichnetes Kapital', patterns: [/Gezeichnetes Kapital/i, /Stammkapital/i], parentKey: 'equity_total', numberLabel: 'I.' },
  { key: 'capital_reserve', statement: 'balance_liabilities', labelDe: 'Kapitalrücklage', patterns: [/Ka.?italr.ckla/i], parentKey: 'equity_total', numberLabel: 'II.', exclude: /Entnahme/i },
  { key: 'net_result_balance', statement: 'balance_liabilities', labelDe: 'Jahresfehlbetrag / Bilanzverlust', patterns: [/Jahresfehlbetra/i, /Bilanzverlust/i, /Jahresüberschuss/i], parentKey: 'equity_total', numberLabel: 'III.', result: true },
  { key: 'equity_total', statement: 'balance_liabilities', labelDe: 'Summe Eigenkapital', patterns: [/Summe Ei.enkap/i], emphasis: 'total', numberLabel: 'A.', sumOf: ['subscribed_capital', 'capital_reserve', 'net_result_balance'] },
  { key: 'special_item_grants', statement: 'balance_liabilities', labelDe: 'Sonderposten für Investitionszuschüsse', patterns: [/andere Sonderposten/i, /Sonder.osten/i], emphasis: 'subtotal', numberLabel: 'B.' },
  { key: 'provisions_total', statement: 'balance_liabilities', labelDe: 'Rückstellungen', patterns: [/Summe R.ckstellungen/i, /sonstige R.ckstellungen\s/i], emphasis: 'subtotal', numberLabel: 'C.', sumOf: ['other_provisions'] },
  { key: 'other_provisions', statement: 'balance_liabilities', labelDe: 'Sonstige Rückstellungen', patterns: [/sonstige R.ckstellungen/i], parentKey: 'provisions_total' },
  { key: 'bank_liabilities', statement: 'balance_liabilities', labelDe: 'Verbindlichkeiten gegenüber Kreditinstituten', patterns: [/gegen.ber Kreditinstituten/i], parentKey: 'liabilities_total', numberLabel: '1.' },
  { key: 'advance_payments_received', statement: 'balance_liabilities', labelDe: 'Erhaltene Anzahlungen', patterns: [/Erhaltene Anzahlungen/i], parentKey: 'liabilities_total', numberLabel: '1.' },
  { key: 'trade_payables', statement: 'balance_liabilities', labelDe: 'Verbindlichkeiten aus Lieferungen und Leistungen', patterns: [/Verbindlichkeiten aus Lieferungen/i], parentKey: 'liabilities_total' },
  { key: 'shareholder_liabilities', statement: 'balance_liabilities', labelDe: 'Verbindlichkeiten gegenüber Gesellschaftern', patterns: [/Verbindlichkeiten gegen.ber Gesellschaftern/i], parentKey: 'liabilities_total' },
  { key: 'unused_grants_liabilities', statement: 'balance_liabilities', labelDe: 'Verbindlichkeiten aus noch nicht verwendeten Zuschüssen', patterns: [/noch nicht verwendeten Zusch/i], parentKey: 'liabilities_total' },
  { key: 'other_liabilities', statement: 'balance_liabilities', labelDe: 'Sonstige Verbindlichkeiten', patterns: [/sonstige Verbindlichkeiten/i], parentKey: 'liabilities_total' },
  { key: 'liabilities_total', statement: 'balance_liabilities', labelDe: 'Summe Verbindlichkeiten', patterns: [/Summe Verbindlichkeiten/i], emphasis: 'total', numberLabel: 'D.', sumOf: ['bank_liabilities', 'advance_payments_received', 'trade_payables', 'shareholder_liabilities', 'unused_grants_liabilities', 'other_liabilities'] },
  { key: 'total_equity_and_liabilities', statement: 'balance_liabilities', labelDe: 'Bilanzsumme', patterns: [], emphasis: 'total' },

  // ------------------------------------------------------------------ GuV
  { key: 'revenue', statement: 'income', labelDe: 'Umsatzerlöse', patterns: [/Ums.tzerl/i], numberLabel: '1.' },
  { key: 'change_in_work_in_progress', statement: 'income', labelDe: 'Veränderung des Bestandes an fertigen und unfertigen Erzeugnissen', patterns: [/(?:Verminderung|Erh.hung) des Bestandes/i], numberLabel: '2.', result: true },
  { key: 'activated_own_work', statement: 'income', labelDe: 'Andere aktivierte Eigenleistungen', patterns: [/aktivierte Eigenleistungen/i], numberLabel: '2.' },
  { key: 'other_operating_income', statement: 'income', labelDe: 'Sonstige betriebliche Erträge', patterns: [/sonstige betriebliche Ertr/i], numberLabel: '3.' },
  { key: 'total_performance', statement: 'income', labelDe: 'Gesamtleistung', patterns: [/Gesamtleistung/i], numberLabel: '4.', emphasis: 'subtotal' },
  { key: 'material_raw_supplies', statement: 'income', labelDe: 'Aufwendungen für Roh-, Hilfs- und Betriebsstoffe und für bezogene Waren', patterns: [/Betriebsstoffe und f.r bezogene Waren/i], parentKey: 'material_expenses_total', numberLabel: 'a)' },
  { key: 'material_purchased_services', statement: 'income', labelDe: 'Aufwendungen für bezogene Leistungen', patterns: [/bezogene Leistun/i], parentKey: 'material_expenses_total', numberLabel: 'b)' },
  { key: 'material_expenses_total', statement: 'income', labelDe: 'Materialaufwand', patterns: [], numberLabel: '4.', emphasis: 'subtotal', sumOf: ['material_raw_supplies', 'material_purchased_services'] },
  { key: 'wages_salaries', statement: 'income', labelDe: 'Löhne und Gehälter', patterns: [/L.hne und Geh.lter/i], parentKey: 'personnel_expenses_total', numberLabel: 'a)' },
  { key: 'social_security_pension', statement: 'income', labelDe: 'Soziale Abgaben und Aufwendungen für Altersversorgung', patterns: [/soziale Abgaben und Aufwendungen f/i], parentKey: 'personnel_expenses_total', numberLabel: 'b)' },
  { key: 'personnel_expenses_total', statement: 'income', labelDe: 'Personalaufwand', patterns: [], numberLabel: '5.', emphasis: 'subtotal', sumOf: ['wages_salaries', 'social_security_pension'] },
  { key: 'pension_expenses', statement: 'income', labelDe: 'davon für Altersversorgung', patterns: [/davon f.r Altersversorgung/i], emphasis: 'memo' },
  { key: 'depreciation', statement: 'income', labelDe: 'Abschreibungen', patterns: [/auf immaterielle Verm.gensgegen/i, /Abschreibungen auf immaterielle/i], numberLabel: '6./7.' },
  { key: 'other_operating_expenses', statement: 'income', labelDe: 'Sonstige betriebliche Aufwendungen', patterns: [/sonstige betriebliche Aufwendungen/i], numberLabel: '7./8.' },
  { key: 'operating_result', statement: 'income', labelDe: 'Betriebsergebnis', patterns: [/Betriebsergebnis/i], numberLabel: '9.', emphasis: 'subtotal', result: true },
  { key: 'interest_income', statement: 'income', labelDe: 'Sonstige Zinsen und ähnliche Erträge', patterns: [/Zinsen und .hnliche Ertr/i], numberLabel: '8./10.' },
  { key: 'interest_expense', statement: 'income', labelDe: 'Zinsen und ähnliche Aufwendungen', patterns: [/Zinsen und .hnliche Aufwendungen/i], numberLabel: '9./11.' },
  { key: 'financial_result', statement: 'income', labelDe: 'Finanzergebnis', patterns: [/Finanzergebnis/i], numberLabel: '12.', emphasis: 'subtotal', result: true },
  { key: 'result_after_taxes', statement: 'income', labelDe: 'Ergebnis nach Steuern', patterns: [/Ergebnis nach Steuern/i], numberLabel: '11./13.', result: true },
  { key: 'income_taxes', statement: 'income', labelDe: 'Steuern vom Einkommen und vom Ertrag', patterns: [/Steuern vom Einkommen/i], numberLabel: '10.' },
  { key: 'other_taxes', statement: 'income', labelDe: 'Sonstige Steuern', patterns: [/sonstige Steuern/i], numberLabel: '12./14.' },
  { key: 'net_result', statement: 'income', labelDe: 'Jahresfehlbetrag / Jahresüberschuss', patterns: [/Jahresfehlbetra/i, /Jahres.berschuss/i], numberLabel: '13./15.', emphasis: 'total', result: true },
];

export interface StatementResult {
  facts: Fact[];
  warnings: string[];
  /** Labels of lines that carried amounts but matched no figure. */
  unmatched: string[];
}

interface Line {
  text: string;
  page: number;
}

/** The pages that carry the statements, not the Anhang or the Anlagespiegel. */
export function statementPages(pages: { page_number: number; text: string }[]): {
  page_number: number;
  text: string;
}[] {
  return pages.filter((p) =>
    /A\s*K\s*T\s*I\s*V\s*A|P\s*A\s*S\s*S\s*I\s*V\s*A|Aktivseite|Passivseite|Ums.tzerl|GEWINN- UND VERLUST|Gewinn- und Verlustrechnung/i.test(
      p.text,
    ),
  );
}

/** "1.", "II.", "a)", "Summe " – a new row starts here. OCR misreads roman numerals ("Il.", "Ill."). */
const LABEL_MARK = /(?:^|\s)(?:(?:[IVXl1]{1,6}|[A-Z]{1,4}|\d{1,2})\.(?!\d)\s*|[a-zäöüß]\)\s*|Summe\s+|davon\s+)/;

/** Narrative lines ("…entwickelte sich im Geschäftsjahr …") are no rows and borrow no amounts. */
const NARRATIVE =
  /\b(sich|wie\s+folgt|werden|wird|wurde|wurden|ist|sind|ergibt|ergeben|erfolgt|entwickelt|entwickelte|beträgt|angesetzt|vorgenommen|dargestellt|ausgewiesen|bezeichnet|korrespondierend)\b|[:;?!]\s*$/i;

/** Amounts after `at`, cut off at the next label mark (two statements on one line). */
function amountsAfter(line: string, at: number): number[] {
  const rest = line.slice(at);
  const next = LABEL_MARK.exec(rest);
  const cut = next ? next.index : rest.length;
  return [...amountSpans(rest.slice(0, cut))].map((s) => s.value);
}

function labelMarkCount(text: string): number {
  return [...text.matchAll(new RegExp(LABEL_MARK.source, 'g'))].length;
}

function numbersInLine(text: string): boolean {
  return [...amountSpans(text)].length > 0;
}

/**
 * True when `at` sits in the line's own label. Two statements side by side
 * (Aktiva | Passiva) put a second label on the same line – the amounts of the
 * first one are then not the ones printed behind the second.
 */
function isFirstLabel(text: string, at: number): boolean {
  const head = text.slice(0, at).replace(/^\s*(?:[IVXl1]{1,6}|[A-Z]{1,4}|\d{1,2})\.(?!\d)\s*/, '');
  return !LABEL_MARK.test(head);
}

/**
 * Amounts of a label that wraps over the following lines ("…, gewerb-" / "liche …").
 * A complete row of the other column is skipped; a new labelled row ends the search.
 */
function gatherAmounts(lines: Line[], from: number): number[] {
  const gathered: number[] = [];
  for (let j = from; j < lines.length && j < from + 3; j += 1) {
    const amounts = [...amountSpans(lines[j].text)].map((s) => s.value);
    const firstAt = [...amountSpans(lines[j].text)][0]?.index ?? lines[j].text.length;
    const marked = LABEL_MARK.test(lines[j].text.slice(0, firstAt));
    if (marked && amounts.length >= 2) continue; // the other column's own row
    if (marked) break; // a new labelled row without amounts
    if (amounts.length === 0) continue; // the label's own continuation
    if (labelOf(lines[j].text).trim().length === 0) continue; // a bare group total, not a wrap
    gathered.push(...amounts);
    if (gathered.length >= 2) break;
  }
  return gathered;
}

/**
 * The extraction keeps x-positions: two statements side by side are separated by
 * wide padding, each column with its own label and its own amounts. Splitting
 * there gives every statement its own line; small gaps (schedule headers such as
 * "Anschaffungs-,   Zugänge") stay untouched.
 */
const COLUMN_GAP = /\s{4,}(?=[A-Za-zÄÖÜäöüß])/;

function splitColumns(line: string): string[] {
  return line
    .split(COLUMN_GAP)
    .map((s) => s.replace(/\s+$/, ''))
    .filter((s) => s.trim() !== '');
}

/** OCR quirks: umlauts dropped, letters split up ("K a p italrücklage", "Kaoitalrucklaae"). */
function foldUmlauts(text: string): string {
  return text
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 's')
    .replace(/Ä/g, 'A')
    .replace(/Ö/g, 'O')
    .replace(/Ü/g, 'U');
}

/** One pass of each rule; the single-letter runs rebuild words split by the OCR. */
function normalizeLine(raw: string): string {
  return foldUmlauts(
    raw
      .replace(/\b([A-Za-zÄÖÜäöüß]) (?=[A-Za-zÄÖÜäöüß])/g, '$1')
      .replace(/ (?=[.·,;:)])/g, ''),
  );
}

const foldedCache = new WeakMap<RegExp, RegExp>();

/** The pattern with umlauts folded, for lines normalised the same way. */
function folded(pattern: RegExp): RegExp {
  let cached = foldedCache.get(pattern);
  if (!cached) {
    cached = new RegExp(foldUmlauts(pattern.source), pattern.flags.replace('g', ''));
    foldedCache.set(pattern, cached);
  }
  return cached;
}

/** A line of only amounts and punctuation ("3.712.510,40 3.824.054,68"). */
function isBare(line: string): boolean {
  return [...amountSpans(line)].length >= 2 && !/[A-Za-z]{3}/.test(line);
}

/** The label part of a line (everything before the first amount). */
function labelOf(line: string): string {
  const spans = [...amountSpans(line)];
  return spans.length > 0 ? line.slice(0, spans[0].index) : line;
}

/** Results keep the economic sign: a loss or a decrease is negative. */
function normalizeResult(label: string, values: [number, number]): [number, number] {
  const loss = /fehlbetrag|verlust|verminderung/i.test(label);
  const gain = /überschuss|gewinn|erh.hung/i.test(label);
  if (!loss && !gain) return values;
  const sign = loss ? -1 : 1;
  return [sign * Math.abs(values[0]), sign * Math.abs(values[1])];
}

/** Reads all figures of one report from its page texts. */
export function parseStatements(
  pages: { page_number: number; text: string }[],
  periodId: string,
  priorId: string | null,
): StatementResult {
  const lines: Line[] = [];
  for (const page of statementPages(pages)) {
    for (const raw of page.text.split('\n')) {
      for (const text of splitColumns(raw)) lines.push({ text: normalizeLine(text), page: page.page_number });
    }
  }

  const found = new Map<string, [number, number]>();
  const usedLabels = new Set<string>();
  const warnings: string[] = [];

  for (const spec of FACT_SPECS) {
    if (spec.patterns.length === 0) continue;
    const anchorAt = spec.after
      ? new Set(
          lines
            .map((l, idx) => (folded(spec.after!.anchor).test(l.text) ? idx : -1))
            .filter((idx) => idx >= 0),
        )
      : null;
    const nearAnchor = (i: number) => {
      if (!anchorAt || !spec.after) return true;
      const within = spec.after.within ?? 5;
      for (let d = 0; d <= within; d += 1) if (anchorAt.has(i - d)) return true;
      return false;
    };
    for (const pattern of spec.patterns) {
      let hit = false;
      for (let i = 0; i < lines.length && !hit; i += 1) {
        if (!nearAnchor(i)) continue;
        if (spec.exclude && folded(spec.exclude).test(lines[i].text)) continue;
        // The line alone first, then joined with the next one: labels wrap.
        const spans: { text: string; endLine: number }[] = [{ text: lines[i].text, endLine: i }];
        if (i + 1 < lines.length) spans.push({ text: `${lines[i].text} ${lines[i + 1].text}`, endLine: i + 1 });
        for (const span of spans) {
          const match = folded(pattern).exec(span.text);
          if (!match) continue;
          // A match that starts in the next line gets its own turn there – the
          // line context (own label, amounts) would be the wrong one here.
          if (span.endLine !== i && match.index >= lines[i].text.length) continue;
          const matchEnd = match.index + match[0].length;
          const rest = span.text.slice(matchEnd);
          const firstAmount = [...amountSpans(rest)][0];
          // A label mark between the label and its amounts means the amounts
          // belong to the second statement; marks behind the amounts are just
          // the other column's label and do not disqualify the row.
          const own =
            isFirstLabel(lines[i].text, match.index) &&
            !LABEL_MARK.test(firstAmount ? rest.slice(0, firstAmount.index) : rest);
          const narrative = folded(NARRATIVE).test(lines[i].text);
          let numbers = amountsAfter(span.text, matchEnd);
          if (span.endLine !== i && (!own || narrative)) {
            // Amounts behind the line boundary belong to the wrapped label of
            // the other column, or to the row a narrative line announces.
            numbers = amountsAfter(lines[i].text, matchEnd);
          }
          let values = numbers.length > 0 ? pair(numbers) : null;
          if (!values && numbers.length === 1 && span.endLine === i) {
            // A wrapped label splits its two amounts over two lines: the current
            // amount sits on the line where the label ends, the prior on the line
            // where it starts. An explicit "(Vorjahr: …)" line is the exception.
            const next = i + 1 < lines.length ? lines[i + 1].text : null;
            const prev = i > 0 ? lines[i - 1].text : null;
            const nextAmounts = next ? [...amountSpans(next)].map((s) => s.value) : [];
            const prevAmounts = prev ? [...amountSpans(prev)].map((s) => s.value) : [];
            if (next && /vorjahr/i.test(next) && nextAmounts.length === 1) {
              values = [numbers[0], nextAmounts[0]];
            } else if (next && nextAmounts.length === 1 && !LABEL_MARK.test(next)) {
              values = [nextAmounts[0], numbers[0]];
            } else if (prev && prevAmounts.length === 1 && !LABEL_MARK.test(labelOf(lines[i].text))) {
              values = [numbers[0], prevAmounts[0]];
            }
          }
          if (!values && numbers.length === 0) {
            // The label wraps before its amounts ("…, gewerb-" / "liche …"). The
            // line's own label may gather them, even behind a second statement's
            // label; a second statement's label may not – the amounts below
            // belong to the first label's continuation. Narrative lines borrow none.
            const first = isFirstLabel(lines[i].text, match.index);
            if (first && !narrative) {
              const gathered = gatherAmounts(lines, span.endLine + 1);
              if (gathered.length > 0) {
                numbers.push(...gathered);
                values = pair(numbers);
              }
            } else if (!narrative && (labelMarkCount(lines[i].text) >= 2 || numbersInLine(lines[i].text))) {
              warnings.push(`„${spec.labelDe}": Beträge nicht zuordenbar (zwei Positionen in einer Zeile) – Wert fehlt.`);
            }
          }
          if (!values && numbers.length > 2) {
            // The label keeps its own pair; further amounts are the next
            // column's figures printed without a label of their own.
            values = [numbers[0], numbers[1]];
            warnings.push(`„${spec.labelDe}": ${numbers.length} Beträge in einer Zeile – erste beiden als Jahr/Vorjahr übernommen.`);
          }
          if (!values) {
            if (numbers.length > 0) {
              warnings.push(`„${spec.labelDe}": ${numbers.length} Beträge, erwartet werden zwei (Jahr, Vorjahr).`);
            }
            continue;
          }
          const label = labelOf(span.text);
          found.set(spec.key, spec.result ? normalizeResult(label, values) : values);
          for (let k = i; k <= span.endLine; k += 1) usedLabels.add(lines[k].text.trim());
          hit = true;
          break;
        }
      }
      if (hit) break;
    }
  }

  // Labels that wrap over several lines are re-read from the row parser — but
  // only on pages with a single statement, where rows cannot mix two columns.
  const soloPages = statementPages(pages).filter(
    (p) => !(/A\s*K\s*T\s*I\s*V\s*A/i.test(p.text) && /P\s*A\s*S\s*S\s*I\s*V\s*A/i.test(p.text)),
  );
  const rowLines: { label: string; numbers: number[]; unlabeled: boolean }[] = [];
  for (const page of soloPages) {
    for (const row of rowsFromText(page.text, page.page_number)) {
      if (row.numbers.length > 0) rowLines.push(row);
    }
  }
  for (const spec of FACT_SPECS) {
    if (found.has(spec.key)) continue;
    for (const pattern of spec.patterns) {
      // The figure's own row is the shortest label that contains the pattern –
      // not the group row or the bare total that carries the same words.
      const matches = rowLines.filter((r) => !r.unlabeled && folded(pattern).test(foldUmlauts(r.label)));
      const row = matches.sort((a, b) => a.label.length - b.label.length)[0];
      if (!row) continue;
      const values = pair(row.numbers);
      if (!values) break;
      found.set(spec.key, spec.result ? normalizeResult(row.label, values) : values);
      break;
    }
  }

  // Balance-sheet totals: a bare amount line at the end of the Aktiva/Passiva page.
  for (const page of statementPages(pages)) {
    const bare = page.text
      .split('\n')
      .map((text, i) => ({ text, i }))
      .filter((l) => isBare(l.text));
    if (bare.length === 0) continue;
    const last = bare[bare.length - 1];
    const numbers = [...amountSpans(last.text)].map((s) => s.value);
    const assets = /A\s*K\s*T\s*I\s*V\s*A/i.test(page.text);
    const liabs = /P\s*A\s*S\s*S\s*I\s*V\s*A/i.test(page.text);
    if (numbers.length >= 4) {
      if (!found.has('total_assets')) found.set('total_assets', [numbers[0], numbers[1]]);
      if (!found.has('total_equity_and_liabilities')) {
        found.set('total_equity_and_liabilities', [numbers[2], numbers[3]]);
      }
    } else if (numbers.length >= 2) {
      const key = assets && !liabs ? 'total_assets' : liabs && !assets ? 'total_equity_and_liabilities' : null;
      if (key && !found.has(key)) found.set(key, [numbers[0], numbers[1]]);
    }
    usedLabels.add(last.text.trim());
  }

  // Implausible figures are dropped instead of silently trusted: unreadable
  // amounts (OCR garbage), a balance-sheet total below zero, or a printed total
  // smaller than its own items (the number came from the wrong row).
  const labelOfKey = (key: string) => FACT_SPECS.find((s) => s.key === key)?.labelDe ?? key;
  for (const [key, v] of [...found]) {
    if (Math.abs(v[0]) > 1e11 || Math.abs(v[1]) > 1e11) {
      found.delete(key);
      warnings.push(`„${labelOfKey(key)}": Betrag nicht lesbar (wahrscheinlich OCR-Fehler) – Wert fehlt.`);
    }
  }
  for (const key of ['total_assets', 'total_equity_and_liabilities']) {
    const v = found.get(key);
    if (v && v[0] <= 0) {
      found.delete(key);
      warnings.push(`„Bilanzsumme": unplausibel (${v[0]}) – Wert fehlt.`);
    }
  }
  for (const spec of FACT_SPECS) {
    const v = found.get(spec.key);
    if (!v || !spec.sumOf?.length) continue;
    const parts = spec.sumOf.map((k) => found.get(k));
    if (parts.every((p) => !p)) continue;
    const sums: [number, number] = [
      parts.reduce((s, p) => s + (p ? p[0] : 0), 0),
      parts.reduce((s, p) => s + (p ? p[1] : 0), 0),
    ];
    if (sums.some((s, idx) => Math.abs(s) > 0.005 && v[idx] < s - 0.05)) {
      found.delete(spec.key);
      warnings.push(`„${spec.labelDe}": ausgewiesene Summe kleiner als ihre Teile – neu berechnet.`);
    }
  }

  // Group totals the report prints as bare amount lines, summed from their items.
  // Items a layout does not have count as 0; derived totals are recomputed every
  // pass until stable, so a parent is never frozen while its items are missing.
  const printed = new Set(found.keys());
  for (let pass = 0; pass < 8; pass += 1) {
    let changed = false;
    for (const spec of FACT_SPECS) {
      if (!spec.sumOf?.length) continue;
      if (printed.has(spec.key) && found.has(spec.key)) continue;
      const parts = spec.sumOf.map((k) => found.get(k));
      if (parts.every((p) => !p)) continue;
      const sum: [number, number] = [
        parts.reduce((s, p) => s + (p ? p[0] : 0), 0),
        parts.reduce((s, p) => s + (p ? p[1] : 0), 0),
      ];
      const prev = found.get(spec.key);
      if (prev && Math.abs(prev[0] - sum[0]) < 0.005 && Math.abs(prev[1] - sum[1]) < 0.005) continue;
      found.set(spec.key, sum);
      changed = true;
    }
    if (!changed) break;
  }

  // The same amount read for several figures is the signature of a misassignment.
  const byValue = new Map<string, string[]>();
  for (const [key, v] of found) {
    if (Math.abs(v[0]) < 0.005) continue;
    byValue.set(String(v[0]), [...(byValue.get(String(v[0])) ?? []), key]);
  }
  for (const [value, keys] of byValue) {
    if (keys.length >= 3) {
      warnings.push(
        `Gleicher Betrag (${Number(value).toLocaleString('de-DE', { minimumFractionDigits: 2 })}) für ${keys.length} Positionen gelesen – vermutlich falsch zugeordnet (${keys.join(', ')}).`,
      );
    }
  }

  const facts: Fact[] = [];
  for (const spec of FACT_SPECS) {
    const v = found.get(spec.key);
    if (!v) continue;
    facts.push({
      key: spec.key,
      statement: spec.statement,
      labelDe: spec.labelDe,
      numberLabel: spec.numberLabel,
      parentKey: spec.parentKey,
      emphasis: spec.emphasis,
      unit: spec.unit ?? 'EUR',
      values: priorId ? { [periodId]: v[0], [priorId]: v[1] } : { [periodId]: v[0] },
    });
  }

  const unmatched: string[] = [];
  for (const line of lines) {
    if (usedLabels.has(line.text.trim())) continue;
    if (!isBare(line.text)) continue;
    const label = line.text.slice(0, line.text.search(/\d/)).trim();
    if (label.length > 2) unmatched.push(label);
  }

  return { facts, warnings: [...new Set(warnings)], unmatched: [...new Set(unmatched)].slice(0, 20) };
}

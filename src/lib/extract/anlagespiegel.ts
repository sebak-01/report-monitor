/**
 * Reads the Anlagespiegel (fixed asset schedule) out of a report page: the
 * column structure from the header block, and one row per asset item.
 *
 * PDF text layers omit empty cells, so a row prints fewer amounts than the
 * table has columns. The columns of a row are therefore chosen so that the
 * printed roll-forward identities hold:
 *
 *   AHK 01.01 + Zugänge − Abgänge ± Umbuchungen = AHK 31.12
 *   AfA 01.01 + AfA GJ − AfA-Abgänge ± AfA-Umbuchungen ± Zuschreibung = AfA 31.12
 *   AHK 31.12 − AfA 31.12 = Buchwert   (and the same for the prior-year book value)
 */

import type { Schedule, ScheduleColumn, ScheduleColumnRole, ScheduleRow, Unit } from '../../types';
import { rowsFromText, type RawRow } from './rows';

const TOLERANCE = 0.05;

interface Layout {
  /** Column roles in printing order. */
  roles: readonly ScheduleColumnRole[];
  /** Group heading per column (what the header prints above the columns). */
  groups: readonly (string | undefined)[];
  labels: readonly string[];
}

const COST = 'Anschaffungs- und Herstellungskosten';
const DEP = 'Abschreibungen';
const BOOK = 'Restbuchwerte';

/**
 * Known layouts, keyed by the shape of the header block. New reports add an
 * entry here (or fall back to the generic layout below).
 */
function detectLayout(header: string, columnCount: number): Layout {
  const h = header.replace(/\s+/g, ' ');
  const has = (word: string) => h.includes(word);
  const twoBook = (has('Vorjahr') ? 1 : 0) + (has('Restbuchwerte') || /Buchwert Buchwert/.test(h) ? 1 : 0);

  if (columnCount === 11 && has('Restbuchwerte')) {
    // TIME: Abschreibungen without transfers, two book values (prior, current).
    return {
      roles: [
        'cost-start', 'additions', 'disposals', 'transfers', 'cost-end',
        'accdep-start', 'dep-expense', 'dep-disposals', 'accdep-end',
        'book-value-prior', 'book-value',
      ],
      groups: [COST, COST, COST, COST, COST, DEP, DEP, DEP, DEP, BOOK, BOOK],
      labels: [
        'Stand 01.01.', 'Zugänge', 'Abgänge', 'Umbuchungen', 'Stand 31.12.',
        'Stand 01.01.', 'Zugänge', 'Abgänge', 'Stand 31.12.',
        'zum 31.12. des Vorjahres', 'zum 31.12.',
      ],
    };
  }
  if (columnCount === 12 && has('Zuschreibung')) {
    // ifos from 2025: plus a write-up column before the book value.
    return {
      roles: [
        'cost-start', 'additions', 'disposals', 'transfers', 'cost-end',
        'accdep-start', 'dep-expense', 'dep-disposals', 'dep-transfers', 'accdep-end',
        'write-ups', 'book-value',
      ],
      groups: [COST, COST, COST, COST, COST, DEP, DEP, DEP, DEP, DEP, DEP, BOOK],
      labels: [
        'AHK 01.01.', 'Zugänge', 'Abgänge', 'Umbuchungen', 'AHK 31.12.',
        'kum. AfA 01.01.', 'AfA Geschäftsjahr', 'Abgänge', 'Umbuchungen', 'kum. AfA 31.12.',
        'Zuschreibung Geschäftsjahr', 'Buchwert 31.12.',
      ],
    };
  }
  if (columnCount === 12 && twoBook > 0) {
    // FGK: two book values (current, prior) at the end.
    return {
      roles: [
        'cost-start', 'additions', 'disposals', 'transfers', 'cost-end',
        'accdep-start', 'dep-expense', 'dep-disposals', 'dep-transfers', 'accdep-end',
        'book-value', 'book-value-prior',
      ],
      groups: [COST, COST, COST, COST, COST, DEP, DEP, DEP, DEP, DEP, BOOK, BOOK],
      labels: [
        'AHK 01.01.', 'Zugänge', 'Abgänge', 'Umbuchungen', 'AHK 31.12.',
        'kum. AfA 01.01.', 'AfA Geschäftsjahr', 'Abgänge', 'Umbuchungen', 'kum. AfA 31.12.',
        'Buchwert Geschäftsjahr', 'Buchwert Vorjahr',
      ],
    };
  }
  if (columnCount === 11) {
    // ifos up to 2024: full roll-forward, one book value.
    return {
      roles: [
        'cost-start', 'additions', 'disposals', 'transfers', 'cost-end',
        'accdep-start', 'dep-expense', 'dep-disposals', 'dep-transfers', 'accdep-end',
        'book-value',
      ],
      groups: [COST, COST, COST, COST, COST, DEP, DEP, DEP, DEP, DEP, BOOK],
      labels: [
        'AHK 01.01.', 'Zugänge', 'Abgänge', 'Umbuchungen', 'AHK 31.12.',
        'kum. AfA 01.01.', 'AfA Geschäftsjahr', 'Abgänge', 'Umbuchungen', 'kum. AfA 31.12.',
        'Buchwert 31.12.',
      ],
    };
  }
  // Unknown layout: keep the printed order, name the columns generically.
  const roles: ScheduleColumnRole[] = Array.from({ length: columnCount }, (_, i) => {
    if (i === 0) return 'cost-start';
    if (i === columnCount - 1) return 'book-value';
    return 'other';
  });
  return {
    roles,
    groups: roles.map(() => undefined),
    labels: roles.map((_, i) => `Spalte ${i + 1}`),
  };
}

function valueOf(map: Partial<Record<ScheduleColumnRole, number>>, role: ScheduleColumnRole): number {
  return map[role] ?? 0;
}

function identityScore(map: Partial<Record<ScheduleColumnRole, number>>, layout: Layout): number {
  const has = (role: ScheduleColumnRole) => layout.roles.includes(role);
  const close = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE;
  let score = 0;
  if (has('cost-end')) {
    const end = valueOf(map, 'cost-start') + valueOf(map, 'additions') - valueOf(map, 'disposals') + valueOf(map, 'transfers');
    if (close(end, valueOf(map, 'cost-end'))) score += 1;
  }
  if (has('accdep-end')) {
    const end =
      valueOf(map, 'accdep-start') +
      valueOf(map, 'dep-expense') -
      valueOf(map, 'dep-disposals') +
      valueOf(map, 'dep-transfers') +
      valueOf(map, 'write-ups');
    if (close(end, valueOf(map, 'accdep-end'))) score += 1;
  }
  if (has('book-value') && has('cost-end') && has('accdep-end')) {
    if (close(valueOf(map, 'cost-end') - valueOf(map, 'accdep-end'), valueOf(map, 'book-value'))) score += 1;
  }
  if (has('book-value-prior') && has('cost-start') && has('accdep-start')) {
    if (close(valueOf(map, 'cost-start') - valueOf(map, 'accdep-start'), valueOf(map, 'book-value-prior'))) score += 1;
  }
  return score;
}

/**
 * Places the printed amounts in the columns: every amount goes to one column,
 * in order, unassigned columns count as 0. The placement with the most
 * satisfied identities wins.
 */
export function solveRow(values: number[], layout: Layout, keys: string[]): Record<string, number | null> | null {
  const n = layout.roles.length;
  const k = values.length;
  if (k > n) return null;

  let best: number[] | null = null;
  let bestScore = -1;
  // Choose k of n column indexes, in order.
  const chosen: number[] = [];
  const search = (start: number) => {
    if (chosen.length === k) {
      const map: Partial<Record<ScheduleColumnRole, number>> = {};
      chosen.forEach((col, i) => {
        map[layout.roles[col]] = values[i];
      });
      const score = identityScore(map, layout);
      if (score > bestScore) {
        bestScore = score;
        best = [...chosen];
      }
      return;
    }
    for (let col = start; col < n; col += 1) {
      chosen.push(col);
      search(col + 1);
      chosen.pop();
    }
  };
  search(0);
  if (!best) return null;

  const out: Record<string, number | null> = {};
  keys.forEach((key) => {
    out[key] = 0;
  });
  (best as number[]).forEach((col, i) => {
    out[keys[col]] = values[i];
  });
  return out;
}

/** The header block above the "Euro …" line, and the number of columns. */
function readHeader(lines: string[]): { header: string; columnCount: number; start: number } | null {
  for (let i = 0; i < lines.length; i += 1) {
    const unitRow = lines[i].trim();
    if (/^(?:eur|euro)(?:\s+(?:eur|euro))+$/i.test(unitRow)) {
      const columnCount = unitRow.split(/\s+/).length;
      return { header: lines.slice(0, i).join('\n'), columnCount, start: i + 1 };
    }
  }
  return null;
}

/** Headline rows ("A.Anlagevermögen", "I. …", "II. …") build the row hierarchy. */
function levelOf(label: string): number {
  if (/^A\.\s*Anlageverm/i.test(label) || /^Anlageverm/i.test(label)) return 0;
  if (/^(?:[IVX]{1,5}|\d+)\./.test(label)) return 1;
  if (/^Summe\s+[IVX]{1,5}\./i.test(label)) return 1;
  return 2;
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c] as string)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

export interface AnlagespiegelResult {
  schedule: Schedule | null;
  warnings: string[];
}

/** Reads one Anlagespiegel page into a schedule for one period. */
export function parseAnlagespiegel(text: string, periodId: string, page: number, unit: Unit = 'EUR'): AnlagespiegelResult {
  const warnings: string[] = [];
  const lines = text.split('\n');
  const header = readHeader(lines);
  if (!header) {
    warnings.push('Der Anlagespiegel hat keine Spaltenüberschrift mit Einheitenzeile – die Spalten konnten nicht bestimmt werden.');
    return { schedule: null, warnings };
  }
  const layout = detectLayout(header.header, header.columnCount);
  const body = rowsFromText(lines.slice(header.start).join('\n'), page);

  const columns: ScheduleColumn[] = layout.roles.map((role, i) => ({
    key: role === 'other' ? `col_${i + 1}` : role,
    labelDe: layout.labels[i] ?? `Spalte ${i + 1}`,
    groupDe: layout.groups[i],
    role,
    unit,
  }));
  const columnKeys = columns.map((c) => c.key);

  const usedKeys = new Set<string>();
  const rows: ScheduleRow[] = [];
  let parentKey: string | undefined;

  for (const row of body) {
    const label = row.label.replace(/\s+/g, ' ').trim();
    if (label === '') continue;
    let key = slug(label) || `row_${rows.length + 1}`;
    while (usedKeys.has(key)) key = `${key}_${rows.length}`;
    usedKeys.add(key);

    let values: ScheduleRow['values'] = {};
    if (row.numbers.length > 0) {
      const solved = solveRow(row.numbers, layout, columnKeys);
      // Absurd magnitudes are OCR soup, not figures – keep them out of the data.
      const absurd = solved ? Object.values(solved).some((v) => v !== null && Math.abs(v) > 1e9) : false;
      if (solved && !absurd) {
        values = { [periodId]: solved };
      } else if (absurd) {
        warnings.push(`Zeile „${label}": Beträge nicht lesbar (wahrscheinlich OCR-Fehler) – Werte fehlen.`);
      } else {
        warnings.push(`Zeile „${label}": ${row.numbers.length} Werte passen nicht in ${layout.roles.length} Spalten.`);
      }
    }

    const level = levelOf(label);
    const scheduleRow: ScheduleRow = {
      key,
      labelDe: label,
      numberLabel: /^(\d+\.|[IVX]{1,5}\.)\s*/.exec(label)?.[1],
      emphasis: /^Summe/i.test(label) ? 'total' : level <= 1 ? 'subtotal' : undefined,
      parentKey: level >= 2 ? parentKey : undefined,
      values,
    };
    rows.push(scheduleRow);
    if (level <= 1) parentKey = key;
    if (/^Summe\s+(?:I|II)\./i.test(label)) parentKey = undefined;
  }

  if (rows.length === 0) {
    warnings.push('Der Anlagespiegel enthält keine lesbaren Zeilen.');
    return { schedule: null, warnings };
  }
  return {
    schedule: {
      id: 'anlagespiegel',
      labelDe: 'Anlagespiegel',
      sourceDe: 'Anhang, Entwicklung des Anlagevermögens',
      unit,
      columns,
      rows,
    },
    warnings,
  };
}

/** The page that carries the Anlagespiegel table, if any. */
export function findAnlagespiegelPage(pages: { page_number: number; text: string }[]): {
  page_number: number;
  text: string;
} | null {
  // The table page has a unit row and roll-forward columns; the Anhang only
  // mentions the schedule in prose.
  return (
    pages.find(
      (p) =>
        /(?:^|\n)\s*(?:eur|euro)(?:\s+(?:eur|euro))+/im.test(p.text) &&
        /Zug.nge|Abg.nge|Umbuchungen|Buchwert|Restbuchwert/i.test(p.text),
    ) ?? null
  );
}

export type { RawRow };

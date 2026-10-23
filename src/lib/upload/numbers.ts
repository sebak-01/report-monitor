/** Number parsing for uploaded tables (German and English notation). */

export type NumberFormat = 'de' | 'en';

/** Cell values after reading a file: text, a number, or empty. */
export type Cell = string | number | null;

const EMPTY_MARKERS = new Set(['', '-', '–', '—', 'n/a', 'na', 'k.a.', 'k. a.', 'n.a.', 'null', 'nan']);

/**
 * Parses one cell.
 *  - a number: the value
 *  - `null`: the cell is empty or marks "no value" (-, –, n/a, k.A.)
 *  - `undefined`: the cell holds text that is not a number
 */
export function parseNumber(cell: Cell | undefined, format: NumberFormat): number | null | undefined {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : undefined;

  let text = cell
    .replace(/[  \s]/g, '')
    .replace(/[−–]/g, '-')
    .replace(/(€|eur|t€|teur|%)/gi, '');
  if (EMPTY_MARKERS.has(text.toLowerCase())) return null;

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.endsWith('-')) {
    negative = !negative;
    text = text.slice(0, -1);
  }
  if (text.startsWith('+')) text = text.slice(1);
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  }

  const normalized = format === 'de' ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(normalized)) return undefined;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return undefined;
  return negative ? -value : value;
}

/**
 * Guesses the number notation of a column of cells by looking at the text cells.
 * Defaults to German, the notation of the dashboard's source documents.
 */
export function detectNumberFormat(cells: Cell[]): NumberFormat {
  let de = 0;
  let en = 0;
  for (const cell of cells) {
    if (typeof cell !== 'string') continue;
    const text = cell.replace(/[^\d.,]/g, '');
    if (!/\d/.test(text)) continue;
    const lastDot = text.lastIndexOf('.');
    const lastComma = text.lastIndexOf(',');
    if (lastDot >= 0 && lastComma >= 0) {
      if (lastComma > lastDot) de += 2;
      else en += 2;
    } else if (lastComma >= 0) {
      if (/,\d{3}$/.test(text) && !/^\d{1,3}(,\d{3})+$/.test(text)) de += 1;
      else if (/^\d{1,3}(,\d{3})+$/.test(text)) en += 1;
      else de += 2;
    } else if (lastDot >= 0) {
      if (/^\d{1,3}(\.\d{3})+$/.test(text)) de += 1;
      else en += 2;
    }
  }
  return en > de ? 'en' : 'de';
}

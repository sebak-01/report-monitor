/**
 * Number reading for report text layers (German notation, OCR quirks).
 *
 * Ported from the pilot tooling `tools/extract_statements.py`: amounts always
 * carry two decimals, thousands may be dots, spaces or OCR commas, and the
 * decimal comma may show up as a dot.
 */

/** "55.110,43", "1 679,83", "31,601,88", "198.336,00-", "(2.500,00)" — comma decimals;
 *  "969.67", "70.544.48", "11,174.11" — dot decimals after OCR. The last separator
 *  before the decimals wins. Amounts may butt together ("109.198,00.125.979,00",
 *  "83.594.61.864,64") or carry OCR leftovers (".46.300,00", "48.419,51)"), and one
 *  line may print several. */
const TOKEN =
  /(?:(?<![\d,.])|(?<= \.))-?\(?(?:\d{1,3}(?:[ .,]\d{3})*|\d[\d.,]*)(?:,\d{2}|\.\d{2})\)?(?!\d)|(?:(?<![\d,.])|(?<= \.))-?\(?\d[\d .]*?\.\d{2}(?![\d,])\)?(?!\d)/g;

/** Parses one token into a number; `null` when the token cannot be read. */
export function toFloat(token: string): number | null {
  let text = token.trim();
  let negative = false;
  // Parens may come as a pair or as a lone OCR leftover.
  if (text.startsWith('(')) {
    negative = true;
    text = text.slice(1);
  }
  if (text.endsWith(')')) text = text.slice(0, -1);
  if (text.endsWith('-')) {
    negative = !negative;
    text = text.slice(0, -1);
  }
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  }
  // Spaces are thousands separators; dots as well unless they are the decimal mark.
  const cleaned = text.replace(/ /g, '');
  let value: number;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma > lastDot) {
    // 31,601,88 or 55.110,43: comma is the decimal mark
    const head = cleaned.slice(0, lastComma).replace(/[.,]/g, '');
    const dec = cleaned.slice(lastComma + 1);
    value = Number(`${head}.${dec}`);
  } else {
    // 969.67 or 1.234.56 (dot decimals after OCR): dot is the decimal mark
    const head = cleaned.slice(0, lastDot).replace(/[.,]/g, '');
    const dec = cleaned.slice(lastDot + 1).replace(/[.,]/g, '');
    value = Number(`${head}.${dec}`);
  }
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/** Dates in headlines ("31.12.2024", "01 01 2025") are not amounts. */
const DATE = /\b\d{1,2}[ .]\d{1,2}[ .](?:19|20)\d{2}\b/g;

/** Amounts butted together ("109.198,00.125.979,00", "83.594.61.864,64") – the
 *  dot is a column gap, or OCR glued a decimal end to the next amount. */
const JOINED = /(?<=,\d{2})\.(?=\d)|(?<=\.\d{2})\.(?=\d)/g;

/** All amounts found in a line, in reading order. Dates are not amounts. */
export function numbersIn(text: string): number[] {
  return [...amountSpans(text)].map((s) => s.value);
}

export interface AmountSpan {
  /** Index of the first character of the amount in the original text. */
  index: number;
  value: number;
}

/** Amounts with their positions, for cutting labels off before the first amount. */
export function* amountSpans(text: string): Generator<AmountSpan> {
  // Blank out dates and split butted amounts in place so the offsets stay valid.
  const cleaned = text
    .replace(DATE, (m: string) => ' '.repeat(m.length))
    .replace(JOINED, ' ');
  for (const match of cleaned.matchAll(TOKEN)) {
    const value = toFloat(match[0]);
    if (value === null) continue;
    // "198.336,00-" — the trailing minus is the German notation for negatives.
    const after = cleaned[match.index + match[0].length];
    yield { index: match.index, value: after === '-' ? -value : value };
  }
}

/**
 * (current, prior) from a line with two amounts, or three where one amount
 * repeats (some PDFs print the amount twice) or the middle one is the merged
 * group total printed on the item's row ("a) 74.629,83 + b) 105.580,68 =
 * 180.210,51", so the row reads "b) 105.580,68 180.210,51 107.148,38").
 * Returns null when unreadable.
 */
export function pair(nums: number[]): [number, number] | null {
  if (nums.length === 2) return [nums[0], nums[1]];
  if (nums.length === 3 && Math.abs(nums[0] - nums[1]) < 0.005) return [nums[0], nums[2]];
  if (nums.length === 3 && Math.abs(nums[1] - nums[2]) < 0.005) return [nums[0], nums[1]];
  if (nums.length === 3 && Math.abs(nums[1]) > Math.abs(nums[0]) && Math.abs(nums[1]) > Math.abs(nums[2])) {
    return [nums[0], nums[2]];
  }
  return null;
}

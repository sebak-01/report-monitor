/**
 * Number reading for report text layers (German notation, OCR quirks).
 *
 * Ported from the pilot tooling `tools/extract_statements.py`: amounts always
 * carry two decimals, thousands may be dots, spaces or OCR commas, and the
 * decimal comma may show up as a dot.
 */

/** "55.110,43", "1 679,83", "31,601,88", "198.336,00-", "(2.500,00)" — comma decimals;
 *  "969.67" — dot decimals after OCR. The last separator before the decimals wins. */
const TOKEN =
  /(?<![\d,.])-?\(?\d[\d., ]*?,\d{2}\)?(?!\d)|(?<![\d,.])-?\(?\d[\d ]*\.\d{2}(?![\d,])\)?(?!\d)/g;

/** Parses one token into a number; `null` when the token cannot be read. */
export function toFloat(token: string): number | null {
  let text = token.trim();
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
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
  // Blank out dates in place so the offsets stay valid.
  const cleaned = text.replace(DATE, (m: string) => ' '.repeat(m.length));
  for (const match of cleaned.matchAll(TOKEN)) {
    const value = toFloat(match[0]);
    if (value === null) continue;
    // "198.336,00-" — the trailing minus is the German notation for negatives.
    const after = cleaned[match.index + match[0].length];
    yield { index: match.index, value: after === '-' ? -value : value };
  }
}

/**
 * (current, prior) from a line with two amounts, or three where the first two
 * repeat (some PDFs print the amount twice). Returns null when unreadable.
 */
export function pair(nums: number[]): [number, number] | null {
  if (nums.length === 2) return [nums[0], nums[1]];
  if (nums.length === 3 && Math.abs(nums[0] - nums[1]) < 0.005) return [nums[0], nums[2]];
  return null;
}

/**
 * Turns the lines of a report page into rows: a label and the amounts printed
 * with it.
 *
 * PDF text layers interleave two statements side by side (Aktiva | Passiva), so
 * one line can carry two labels where each keeps its own amounts. Labels wrap
 * both before and after their amounts, and group totals sometimes come as a
 * bare amount line without a label.
 *
 * Rules:
 *  - A line is split at label starts ("1.", "II.", "a)", "Summe "); amounts
 *    belong to the label start before them.
 *  - A label without amounts waits in `pending` until its amounts arrive.
 *  - A line without amounts continues the pending label, or the label of the
 *    row the previous line emitted (wraps after the amounts).
 *  - Amounts before any label form a bare group total (`unlabeled`).
 */

import { amountSpans } from './numbers';

/**
 * Starts a printed row label. A dot must not be a decimal point ("55.110,43"),
 * and a mark must be followed by a letter so that "I. + II." stays one label.
 */
const LABEL_START =
  /(?:^|\s)(?:(?:[IVXl1]{1,6}|[A-Z]{1,4}|\d{1,2})\.(?!\d)\s*(?=[A-Za-zÄÖÜäöüß])|[a-zäöüß]\)\s*|Summe\s+|-\s*davon\s*|davon\s+)/;
/** Page footers that PDF text layers append to the last row of a table. */
const FOOTER = /\s*(?:Anlage\s*\d+\s*\/\s*)?Seite\s*\d+\s*$/i;
const UNIT_ROW = /^(?:eur|euro|t€|teur)(?:\s+(?:eur|euro|t€|teur))*$/i;
/** A label that wraps from the row above ("…/Geschäftsausstattung", "Werten", "einschließlich …"). */
const FRAGMENT = /^[a-zäöüß/(–-]/;
/** A one-word label ("Werten", "Grundstücken") usually wraps the row above. */
function isFragment(label: string): boolean {
  return FRAGMENT.test(label) || !/\s/.test(label.trim());
}

export interface RawRow {
  label: string;
  /** Amounts printed with this label, in reading order. */
  numbers: number[];
  page: number;
  /** True when the amounts carried no label at all (a bare group total). */
  unlabeled: boolean;
  /** True for a label row that never got amounts (headline). */
  headline: boolean;
}

interface Chunk {
  label: string;
  numbers: number[];
  /** The chunk begins at a label mark. */
  marked: boolean;
}

/** Splits a line at label starts; each chunk keeps the amounts after its label. */
export function chunksOf(line: string): Chunk[] {
  const re = new RegExp(LABEL_START.source, 'g');
  const starts: number[] = [];
  for (const match of line.matchAll(re)) {
    starts.push(match.index + match[0].length - match[0].trimStart().length);
  }
  const chunks: Chunk[] = [];
  const push = (text: string, marked: boolean) => {
    const spans = [...amountSpans(text)];
    chunks.push({
      label: spans.length > 0 ? text.slice(0, spans[0].index).trim() : text.trim(),
      numbers: spans.map((s) => s.value),
      marked,
    });
  };
  if (starts.length === 0 || starts[0] > 0) {
    push(line.slice(0, starts[0] ?? line.length), false);
  }
  for (let i = 0; i < starts.length; i += 1) {
    push(line.slice(starts[i], starts[i + 1] ?? line.length), true);
  }
  return chunks;
}

export function rowsFromText(text: string, page: number): RawRow[] {
  const rows: RawRow[] = [];
  /** Label waiting for its amounts (headline, or an item whose amounts wrap). */
  let pending = '';
  /** Last emitted row, for labels that wrap after their amounts. */
  let lastRow: RawRow | null = null;

  const emit = (label: string, numbers: number[], flags: { unlabeled?: boolean; headline?: boolean }): RawRow => {
    const row: RawRow = {
      label,
      numbers,
      page,
      unlabeled: flags.unlabeled ?? false,
      headline: flags.headline ?? false,
    };
    rows.push(row);
    return row;
  };

  const flushPending = () => {
    if (pending.trim() !== '') emit(pending.trim(), [], { headline: true });
    pending = '';
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(FOOTER, '').replace(/\s+$/, '');
    const trimmed = line.trim();
    if (trimmed === '') {
      flushPending();
      lastRow = null;
      continue;
    }
    if (UNIT_ROW.test(trimmed)) continue;

    const chunks = chunksOf(line);
    const numbered = chunks.filter((c) => c.numbers.length > 0);

    if (numbered.length === 0) {
      // A line without amounts: headline, or a label wrap.
      if (chunks.some((c) => c.marked)) {
        flushPending();
        pending = trimmed;
        lastRow = null;
      } else if (pending !== '') {
        pending = `${pending} ${trimmed}`;
      } else if (lastRow && !lastRow.headline) {
        lastRow.label = `${lastRow.label} ${trimmed}`;
      } else {
        pending = trimmed;
      }
      continue;
    }

    for (const chunk of chunks) {
      if (chunk.numbers.length === 0) {
        // A label whose amounts come later (or on another column's line).
        if (chunk.label === '') continue;
        if (chunk.marked) flushPending();
        pending = pending !== '' && !chunk.marked ? `${pending} ${chunk.label}` : chunk.label;
        continue;
      }
      if (chunk.label === '') {
        if (pending !== '') {
          lastRow = emit(pending, chunk.numbers, {});
          pending = '';
        } else {
          const headline = [...rows].reverse().find((r) => r.headline);
          lastRow = emit(headline ? `Summe ${headline.label}` : 'Summe', chunk.numbers, { unlabeled: true });
        }
      } else if (!chunk.marked && isFragment(chunk.label) && pending !== '') {
        // Label fragment completing the pending label ("einschließlich der Bauten …").
        lastRow = emit(`${pending} ${chunk.label}`.trim(), chunk.numbers, {});
        pending = '';
      } else {
        if (chunk.marked) flushPending();
        else if (pending.trim() !== '') emit(pending.trim(), [], { headline: true });
        pending = '';
        lastRow = emit(chunk.label, chunk.numbers, {});
      }
    }
  }

  flushPending();
  return rows;
}

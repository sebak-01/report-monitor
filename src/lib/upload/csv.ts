/** Small RFC 4180 CSV reader with delimiter detection (German Excel exports use ";"). */

const DELIMITERS = [';', ',', '\t', '|'] as const;

export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).slice(0, 20);
  let best: string = ',';
  let bestScore = -1;
  for (const delimiter of DELIMITERS) {
    // Count delimiters outside quotes per line; a good delimiter appears the same number of times in most lines.
    const counts = lines
      .filter((line) => line.trim() !== '')
      .map((line) => {
        let inQuotes = false;
        let count = 0;
        for (const ch of line) {
          if (ch === '"') inQuotes = !inQuotes;
          else if (ch === delimiter && !inQuotes) count += 1;
        }
        return count;
      });
    if (counts.length === 0 || counts.every((c) => c === 0)) continue;
    const mode = counts.sort((a, b) => a - b)[Math.floor(counts.length / 2)];
    const consistent = counts.filter((c) => c === mode).length;
    const score = mode > 0 ? consistent * 1000 + mode : 0;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const source = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop trailing empty lines.
  while (rows.length > 0 && rows[rows.length - 1].every((cell) => cell.trim() === '')) rows.pop();
  return rows;
}

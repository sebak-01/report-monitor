/**
 * Export helpers: the metrics CSV (German locale: semicolon separator, decimal
 * comma). Pure string building only – the browser download glue lives in
 * `src/lib/download.ts`.
 */

import type { MetricRow } from './types';

/** One CSV cell: RFC 4180 quoting when the text contains separator, quote or newline. */
function csvField(text: string): string {
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** 1234.5 -> "1234,5" (decimal comma, no thousands separator – Excel-friendly). */
function csvNumber(value: number, fractionDigits: number): string {
  return value.toFixed(fractionDigits).replace('.', ',');
}

/**
 * The computed metrics as CSV: one row per metric, one column per year.
 * Values are percentage points ("26,9" = 26.9 %); a metric that is not
 * computable for a year becomes an empty cell.
 */
export function metricsToCsv(rows: MetricRow[], periodIds: string[]): string {
  const header = ['Kennzahl', 'Einheit', 'Formel', ...periodIds].map(csvField).join(';');
  const lines = rows.map((row) => {
    const cells = periodIds.map((periodId) => {
      const value = row.values[periodId]?.value;
      return value === null || value === undefined ? '' : csvNumber(value * 100, 1);
    });
    return [row.spec.labelDe, '%', row.spec.formulaDe, ...cells].map(csvField).join(';');
  });
  return [header, ...lines].join('\r\n') + '\r\n';
}

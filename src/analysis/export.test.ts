import { describe, expect, it } from 'vitest';
import { metricsToCsv } from './export';
import type { MetricRow, MetricSpec } from './types';

const spec: MetricSpec = {
  id: 'roe',
  labelDe: 'Eigenkapitalrentabilität; absolut',
  shortDe: 'Verzinsung des Eigenkapitals.',
  formulaDe: 'Jahresergebnis / Eigenkapital',
  forms: [{ numerator: [{ key: 'net_result', sign: 1 }], denominator: [{ key: 'equity_total', sign: 1 }] }],
};

const row = (values: Record<string, number | null>): MetricRow => ({
  spec,
  values: Object.fromEntries(
    Object.entries(values).map(([periodId, value]) => [
      periodId,
      { value, missing: [], assumedZero: [], inputs: [] },
    ]),
  ),
});

describe('metricsToCsv', () => {
  it('writes a German-locale CSV: semicolons and decimal comma', () => {
    const csv = metricsToCsv([row({ '2023': 0.1234, '2024': -0.05 })], ['2023', '2024']);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('Kennzahl;Einheit;Formel;2023;2024');
    expect(lines[1]).toBe('"Eigenkapitalrentabilität; absolut";%;Jahresergebnis / Eigenkapital;12,3;-5,0');
  });

  it('leaves an empty cell when a metric is not computable', () => {
    const csv = metricsToCsv([row({ '2024': null })], ['2024']);
    expect(csv.trimEnd().split('\r\n')[1]).toBe(
      '"Eigenkapitalrentabilität; absolut";%;Jahresergebnis / Eigenkapital;',
    );
  });

  it('ends with a newline', () => {
    expect(metricsToCsv([], ['2024'])).toBe('Kennzahl;Einheit;Formel;2024\r\n');
  });
});

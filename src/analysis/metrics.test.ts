import { describe, expect, it } from 'vitest';
import { computeMetric, computeMetricRows, metricSpec } from './metrics';
import type { AnalysisLookup } from './types';

/** key -> periodId -> value; a key not in the map is "never printed" (undefined). */
type Values = Record<string, Record<string, number | null>>;

function lookupOf(values: Values): AnalysisLookup {
  return (key, periodId) => (key in values ? (values[key][periodId] ?? null) : undefined);
}

describe('computeMetric', () => {
  it('computes the equity ratio', () => {
    const lookup = lookupOf({
      equity_total: { '2024': 250 },
      total_assets: { '2024': 1000 },
    });
    const result = computeMetric(metricSpec('equity_ratio'), lookup, '2024');
    expect(result.value).toBeCloseTo(0.25);
    expect(result.missing).toEqual([]);
    expect(result.inputs.map((i) => i.key)).toEqual(['equity_total', 'total_assets']);
  });

  it('lists missing required inputs instead of computing', () => {
    const lookup = lookupOf({ equity_total: { '2024': 250 } });
    const result = computeMetric(metricSpec('equity_ratio'), lookup, '2024');
    expect(result.value).toBeNull();
    expect(result.missing).toEqual(['total_assets']);
  });

  it('treats "key exists but no value" as missing', () => {
    const lookup = lookupOf({
      equity_total: { '2024': null },
      total_assets: { '2024': 1000 },
    });
    const result = computeMetric(metricSpec('equity_ratio'), lookup, '2024');
    expect(result.value).toBeNull();
    expect(result.missing).toEqual(['equity_total']);
  });

  it('treats an unprinted optional component as 0 and discloses it', () => {
    const lookup = lookupOf({
      cash: { '2024': 130 },
      total_assets: { '2024': 1000 },
      equity_total: { '2024': 250 },
    });
    const result = computeMetric(metricSpec('liquidity_1'), lookup, '2024');
    expect(result.value).toBeCloseTo(130 / 750);
    expect(result.assumedZero).toEqual(['securities_current_total', 'pension_provisions']);
  });

  it('uses optional components when the report discloses them', () => {
    const lookup = lookupOf({
      cash: { '2024': 130 },
      securities_current_total: { '2024': 20 },
      pension_provisions: { '2024': 100 },
      total_assets: { '2024': 1000 },
      equity_total: { '2024': 250 },
    });
    const result = computeMetric(metricSpec('liquidity_1'), lookup, '2024');
    expect(result.value).toBeCloseTo(150 / 650);
    expect(result.assumedZero).toEqual([]);
  });

  it('is n/a when a required input of a sum is missing', () => {
    const lookup = lookupOf({
      cash: { '2024': 130 },
      receivables_total: { '2024': null },
      total_assets: { '2024': 1000 },
      equity_total: { '2024': 250 },
    });
    const result = computeMetric(metricSpec('liquidity_2'), lookup, '2024');
    expect(result.value).toBeNull();
    expect(result.missing).toEqual(['receivables_total']);
  });

  it('subtracts the pension provisions from the short-term debt proxy', () => {
    const lookup = lookupOf({
      current_assets_total: { '2024': 400 },
      pension_provisions: { '2024': 100 },
      total_assets: { '2024': 1000 },
      equity_total: { '2024': 250 },
    });
    const result = computeMetric(metricSpec('liquidity_3'), lookup, '2024');
    expect(result.value).toBeCloseTo(400 / 650);
  });

  it('uses the printed operating result for the EBIT margin', () => {
    const lookup = lookupOf({
      operating_result: { '2024': 80 },
      total_performance: { '2024': 1000 },
    });
    const result = computeMetric(metricSpec('ebit_margin'), lookup, '2024');
    expect(result.value).toBeCloseTo(0.08);
  });

  it('derives the EBIT margin from the GuV chain when the operating result is missing', () => {
    const lookup = lookupOf({
      result_after_taxes: { '2024': 100 },
      income_taxes: { '2024': 30 },
      financial_result: { '2024': -20 },
      total_performance: { '2024': 1000 },
    });
    const result = computeMetric(metricSpec('ebit_margin'), lookup, '2024');
    expect(result.value).toBeCloseTo(0.15);
    expect(result.missing).toEqual([]);
  });

  it('is n/a when no EBIT derivation works', () => {
    const lookup = lookupOf({ total_performance: { '2024': 1000 } });
    const result = computeMetric(metricSpec('ebit_margin'), lookup, '2024');
    expect(result.value).toBeNull();
    expect(result.missing).toEqual(
      expect.arrayContaining(['operating_result', 'result_after_taxes', 'income_taxes', 'financial_result', 'net_result']),
    );
  });

  it('derives the EBIT margin from the interest-based variant', () => {
    const lookup = lookupOf({
      net_result: { '2024': 50 },
      interest_expense: { '2024': 10 },
      interest_income: { '2024': 5 },
      total_performance: { '2024': 1000 },
    });
    const result = computeMetric(metricSpec('ebit_margin'), lookup, '2024');
    expect(result.value).toBeCloseTo(0.055);
  });

  it('assumes no interest income when the report does not print it', () => {
    const lookup = lookupOf({
      net_result: { '2024': 50 },
      interest_expense: { '2024': 10 },
      total_performance: { '2024': 1000 },
    });
    const result = computeMetric(metricSpec('ebit_margin'), lookup, '2024');
    expect(result.value).toBeCloseTo(0.06);
    expect(result.assumedZero).toEqual(['interest_income']);
  });

  it('falls back to the revenue as the margin base', () => {
    const lookup = lookupOf({
      net_result: { '2024': 80 },
      revenue: { '2024': 800 },
    });
    const result = computeMetric(metricSpec('net_margin'), lookup, '2024');
    expect(result.value).toBeCloseTo(0.1);
    expect(result.missing).toEqual([]);
  });

  it('prefers the Gesamtleistung over the revenue as the margin base', () => {
    const lookup = lookupOf({
      net_result: { '2024': 80 },
      total_performance: { '2024': 1000 },
      revenue: { '2024': 500 },
    });
    const result = computeMetric(metricSpec('net_margin'), lookup, '2024');
    expect(result.value).toBeCloseTo(0.08);
  });

  it('is n/a with a note when the denominator is 0', () => {
    const lookup = lookupOf({
      net_result: { '2024': 50 },
      equity_total: { '2024': 0 },
    });
    const result = computeMetric(metricSpec('roe'), lookup, '2024');
    expect(result.value).toBeNull();
    expect(result.missing).toEqual([]);
    expect(result.note).toMatch(/Nenner/);
  });

  it('adds the interest expense to the total capital return', () => {
    const lookup = lookupOf({
      net_result: { '2024': 50 },
      interest_expense: { '2024': 10 },
      total_assets: { '2024': 1000 },
    });
    const result = computeMetric(metricSpec('roa'), lookup, '2024');
    expect(result.value).toBeCloseTo(0.06);
    expect(result.assumedZero).toEqual([]);
  });

  it('computes the debt ratio from the balance sheet identity', () => {
    const lookup = lookupOf({
      total_assets: { '2024': 1000 },
      equity_total: { '2024': 250 },
    });
    const result = computeMetric(metricSpec('debt_ratio'), lookup, '2024');
    expect(result.value).toBeCloseTo(3);
  });
});

describe('computeMetricRows', () => {
  it('computes every metric for every period', () => {
    const lookup = lookupOf({
      equity_total: { '2023': 200, '2024': 250 },
      total_assets: { '2023': 900, '2024': 1000 },
    });
    const rows = computeMetricRows(lookup, ['2023', '2024']);
    expect(rows).toHaveLength(12);
    const equity = rows.find((row) => row.spec.id === 'equity_ratio')!;
    expect(equity.values['2023']!.value).toBeCloseTo(200 / 900);
    expect(equity.values['2024']!.value).toBeCloseTo(0.25);
  });
});

import { describe, expect, it } from 'vitest';
import type { AnalysisLookup, RawReport } from './types';
import {
  checkIdentities,
  checkPriorYearConsistency,
  checkSubTotals,
  summarize,
} from './validation';

type Values = Record<string, Record<string, number | null>>;

function lookupOf(values: Values): AnalysisLookup {
  return (key, periodId) => (key in values ? (values[key][periodId] ?? null) : undefined);
}

describe('checkIdentities', () => {
  const values: Values = {
    total_assets: { '2023': 900, '2024': 1000 },
    total_equity_and_liabilities: { '2023': 900, '2024': 1004 },
    net_result: { '2023': -50, '2024': 80 },
    net_result_balance: { '2023': -50, '2024': null },
  };

  it('passes when both sides agree within the tolerance', () => {
    const findings = checkIdentities(lookupOf(values), ['2023']);
    expect(findings.every((f) => f.severity === 'pass')).toBe(true);
  });

  it('fails and reports both values when they differ', () => {
    const findings = checkIdentities(lookupOf(values), ['2024']);
    const balance = findings.find((f) => f.id === 'balance_sums_equal')!;
    expect(balance.severity).toBe('fail');
    expect(balance.detailDe).toContain('1.000,00');
    expect(balance.detailDe).toContain('1.004,00');
  });

  it('skips instead of failing when a value is missing', () => {
    const findings = checkIdentities(lookupOf(values), ['2024']);
    const net = findings.find((f) => f.id === 'net_result_matches_balance')!;
    expect(net.severity).toBe('skip');
  });
});

describe('checkSubTotals', () => {
  it('passes when the components sum to the total', () => {
    const lookup = lookupOf({
      fixed_assets_total: { '2024': 500 },
      intangible_assets: { '2024': 100 },
      tangible_assets_total: { '2024': 400 },
    });
    const findings = checkSubTotals(lookup, ['2024']).filter((f) => f.id === 'fixed_assets_sum');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('pass');
  });

  it('counts a position the company never prints as 0', () => {
    // financial_assets_total is unknown (undefined), not missing (null).
    const lookup = lookupOf({
      fixed_assets_total: { '2024': 500 },
      intangible_assets: { '2024': 150 },
      tangible_assets_total: { '2024': 350 },
    });
    const findings = checkSubTotals(lookup, ['2024']).filter((f) => f.id === 'fixed_assets_sum');
    expect(findings[0]!.severity).toBe('pass');
  });

  it('skips when a component has no value for the year', () => {
    const lookup = lookupOf({
      fixed_assets_total: { '2024': 500 },
      intangible_assets: { '2024': 150 },
      tangible_assets_total: { '2024': null },
    });
    const findings = checkSubTotals(lookup, ['2024']).filter((f) => f.id === 'fixed_assets_sum');
    expect(findings[0]!.severity).toBe('skip');
  });

  it('flags a total the components do not confirm', () => {
    const lookup = lookupOf({
      material_expenses_total: { '2024': 300 },
      material_raw_supplies: { '2024': 100 },
      material_purchased_services: { '2024': 150 },
    });
    const findings = checkSubTotals(lookup, ['2024']).filter((f) => f.id === 'material_sum');
    expect(findings[0]!.severity).toBe('fail');
    expect(findings[0]!.detailDe).toContain('250,00');
    expect(findings[0]!.detailDe).toContain('300,00');
  });

  it('ignores groups whose total the company never reports', () => {
    const findings = checkSubTotals(lookupOf({}), ['2024']);
    expect(findings).toEqual([]);
  });

  it('respects the tolerance', () => {
    const lookup = lookupOf({
      material_expenses_total: { '2024': 300 },
      material_raw_supplies: { '2024': 100 },
      material_purchased_services: { '2024': 200.005 },
    });
    const findings = checkSubTotals(lookup, ['2024'], 0.01).filter((f) => f.id === 'material_sum');
    expect(findings[0]!.severity).toBe('pass');
  });
});

describe('checkPriorYearConsistency', () => {
  const report2023: RawReport = {
    periodId: '2023',
    facts: [
      { key: 'revenue', labelDe: 'Umsatzerlöse', values: { '2023': 1000, '2022': 900 } },
      { key: 'cash', labelDe: 'Kassenbestand', values: { '2023': 50, '2022': 40 } },
    ],
  };

  it('passes when the prior-year columns match the own-year values', () => {
    const report2024: RawReport = {
      periodId: '2024',
      facts: [{ key: 'revenue', labelDe: 'Umsatzerlöse', values: { '2024': 1100, '2023': 1000 } }],
    };
    const findings = checkPriorYearConsistency([report2023, report2024]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('pass');
  });

  it('warns about deviations and names both report years', () => {
    const report2024: RawReport = {
      periodId: '2024',
      facts: [{ key: 'revenue', labelDe: 'Umsatzerlöse', values: { '2024': 1100, '2023': 1005 } }],
    };
    const findings = checkPriorYearConsistency([report2023, report2024]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('warn');
    expect(findings[0]!.detailDe).toContain('Umsatzerlöse');
    expect(findings[0]!.detailDe).toContain('1.000,00');
    expect(findings[0]!.detailDe).toContain('1.005,00');
  });

  it('compares only when both reports exist', () => {
    const report2024: RawReport = {
      periodId: '2024',
      facts: [{ key: 'revenue', labelDe: 'Umsatzerlöse', values: { '2024': 1100, '2023': 1005 } }],
    };
    expect(checkPriorYearConsistency([report2024])).toEqual([]);
  });

  it('skips facts without both values', () => {
    const report2024: RawReport = {
      periodId: '2024',
      facts: [{ key: 'revenue', labelDe: 'Umsatzerlöse', values: { '2024': 1100 } }],
    };
    const findings = checkPriorYearConsistency([report2023, report2024]);
    expect(findings.some((f) => f.severity === 'warn')).toBe(false);
  });
});

describe('summarize', () => {
  const finding = (severity: 'pass' | 'warn' | 'fail' | 'skip') => ({
    id: 'x',
    labelDe: 'x',
    severity,
    detailDe: 'x',
  });

  it('is green when everything passed', () => {
    expect(summarize([finding('pass'), finding('pass')]).status).toBe('green');
  });

  it('is amber on deviations or when nothing was testable', () => {
    expect(summarize([finding('pass'), finding('warn')]).status).toBe('amber');
    expect(summarize([finding('skip'), finding('skip')]).status).toBe('amber');
    expect(summarize([]).status).toBe('amber');
  });

  it('is red when a check failed', () => {
    const summary = summarize([finding('pass'), finding('fail'), finding('warn')]);
    expect(summary.status).toBe('red');
    expect(summary.failed).toBe(1);
    expect(summary.warned).toBe(1);
    expect(summary.passed).toBe(1);
  });
});

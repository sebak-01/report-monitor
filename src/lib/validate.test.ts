import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Dataset } from '../types';
import { parseDataset } from './dataset';
import { buildGroupedModel } from './grouped';
import { buildKpiCards } from './kpiCards';
import { buildStatementRows } from './statementRows';
import { reportForView, validateDataset } from './validate';

// The pilot dataset is not part of the public repository; these tests only run where the file exists.
const PILOT_FILE = new URL('../../public/data/fgk.json', import.meta.url);
const hasPilot = existsSync(PILOT_FILE);
const describePilot = describe.skipIf(!hasPilot);

const load = (): Dataset => parseDataset(JSON.parse(readFileSync(PILOT_FILE, 'utf-8')));

const normalize = (text: string) => text.replace(/ /g, ' ');

describePilot('pilot dataset: validation', () => {
  it('passes every reconciliation check for all years', () => {
    const dataset = load();
    const report = validateDataset(dataset);
    const failures = report.results.filter((r) => r.status === 'fail');
    expect(failures).toEqual([]);
    const expected = dataset.checks.reduce(
      (sum, c) => sum + (c.periods ? c.periods.length : dataset.periods.length),
      0,
    );
    expect(report.results).toHaveLength(expected);
    expect(dataset.periods.map((p) => p.id)).toEqual(['2018', '2019', '2020', '2021', '2022', '2023', '2024']);
    expect(report.skipped).toBe(0);
    expect(report.ok).toBe(true);
  });

  it('detects a tampered value', () => {
    const dataset = load();
    const revenue = dataset.facts.find((f) => f.key === 'revenue')!;
    revenue.values['2024'] = (revenue.values['2024'] ?? 0) + 100;

    const report = validateDataset(dataset);
    const failed = report.results.filter((r) => r.status === 'fail');
    expect(report.ok).toBe(false);
    expect(failed.map((r) => r.checkId)).toContain('revenue_breakdown_sum');
    expect(failed.every((r) => r.period === '2024')).toBe(true);
  });

  it('detects a wrong Verbindlichkeitenspiegel', () => {
    const dataset = load();
    const fact = dataset.facts.find((f) => f.key === 'maturity_trade_payables_lt1y')!;
    fact.values['2024'] = 50000;
    const failed = validateDataset(dataset).results.filter((r) => r.status === 'fail');
    expect(failed.map((r) => r.checkId)).toEqual(
      expect.arrayContaining(['maturity_trade_payables', 'maturity_total_lt1y']),
    );
  });

  it('skips checks whose inputs are missing instead of treating them as zero', () => {
    const dataset = load();
    dataset.facts.find((f) => f.key === 'trade_receivables')!.values['2024'] = null;

    const report = validateDataset(dataset);
    const skipped = report.results.filter((r) => r.status === 'skipped');
    expect(skipped.map((r) => r.checkId)).toContain('receivables_sum');
    expect(report.failed).toBe(0);
  });

  it('fails checks that reference unknown keys or have invalid formulas', () => {
    const dataset = load();
    dataset.checks.push(
      { id: 'unknown', labelDe: 'x', lhs: 'does_not_exist', rhs: '1' },
      { id: 'broken', labelDe: 'y', lhs: '1 +', rhs: '1' },
    );
    const report = validateDataset(dataset);
    const reasons = report.results.filter((r) => r.status === 'fail').map((r) => r.reason?.code);
    expect(reasons).toContain('missing-key');
    expect(reasons).toContain('invalid-expression');
  });

  it('splits the report by view; checks without a view belong to both', () => {
    const dataset = load();
    dataset.checks.push({ id: 'everywhere', labelDe: 'z', lhs: '1', rhs: '1' });
    const report = validateDataset(dataset);
    const balance = reportForView(report, 'balance');
    const income = reportForView(report, 'income');
    const ids = (r: typeof balance) => new Set(r.results.map((x) => x.checkId));

    expect(ids(balance).has('balance_sums_equal')).toBe(true);
    expect(ids(balance).has('income_chain')).toBe(false);
    expect(ids(income).has('income_chain')).toBe(true);
    expect(ids(income).has('balance_sums_equal')).toBe(false);
    expect(ids(balance).has('net_result_matches_balance')).toBe(true);
    expect(ids(income).has('net_result_matches_balance')).toBe(true);
    expect(ids(balance).has('everywhere') && ids(income).has('everywhere')).toBe(true);
    expect(balance.ok && income.ok).toBe(true);
  });

  it('assigns every check to a known view', () => {
    const dataset = load();
    const known = new Set(dataset.views.map((v) => v.id));
    for (const check of dataset.checks) {
      expect(check.views, check.id).toBeDefined();
      for (const view of check.views ?? []) expect(known.has(view), `${check.id}: ${view}`).toBe(true);
    }
  });
});

describePilot('KPI cards', () => {
  it('computes the Bilanz KPIs with German formatting', () => {
    const cards = buildKpiCards(load(), 'balance');
    const byId = Object.fromEntries(cards.map((c) => [c.id, c]));

    expect(cards.map((c) => c.id)).toEqual(['total-assets', 'fixed-assets', 'equity-ratio', 'cash']);
    expect(normalize(byId['total-assets'].value)).toBe('9,93 Mio. €');
    expect(normalize(byId['total-assets'].delta?.text ?? '')).toBe('-5,0 % ggü. 2023');
    expect(byId['total-assets'].delta?.tone).toBe('neutral');

    expect(normalize(byId['fixed-assets'].exact ?? '')).toBe('8.320.301,50 €');

    expect(normalize(byId['equity-ratio'].value)).toBe('26,9 %');
    expect(normalize(byId['equity-ratio'].delta?.text ?? '')).toBe('+3,8 Prozentpunkte ggü. 2023');
    expect(byId['equity-ratio'].delta?.tone).toBe('good');

    expect(normalize(byId['cash'].value)).toBe('1,18 Mio. €');
    expect(normalize(byId['cash'].delta?.text ?? '')).toBe('+20,8 % ggü. 2023');
  });

  it('computes the GuV KPIs with German formatting', () => {
    const cards = buildKpiCards(load(), 'income');
    const byId = Object.fromEntries(cards.map((c) => [c.id, c]));

    expect(cards.map((c) => c.id)).toEqual(['revenue', 'net-loss', 'personnel', 'personnel-ratio']);
    expect(normalize(byId['revenue'].value)).toBe('2,07 Mio. €');
    expect(normalize(byId['revenue'].delta?.text ?? '')).toBe('+17,4 % ggü. 2023');
    expect(byId['revenue'].delta?.tone).toBe('good');

    expect(normalize(byId['net-loss'].value)).toBe('2,05 Mio. €');
    expect(normalize(byId['net-loss'].delta?.text ?? '')).toBe('-5,9 % ggü. 2023');
    expect(byId['net-loss'].delta?.tone).toBe('good');

    expect(normalize(byId['personnel'].value)).toBe('2,65 Mio. €');
    expect(byId['personnel'].delta?.tone).toBe('neutral');

    expect(normalize(byId['personnel-ratio'].value)).toBe('127,8 %');
    expect(normalize(byId['personnel-ratio'].prior ?? '')).toBe('2023: 152,3 %');
    expect(byId['personnel-ratio'].delta?.direction).toBe('down');
    expect(normalize(byId['personnel-ratio'].delta?.text ?? '')).toBe('-24,6 Prozentpunkte ggü. 2023');
    expect(byId['personnel-ratio'].delta?.tone).toBe('good');
  });

  it('returns no cards for an unknown view', () => {
    expect(buildKpiCards(load(), 'nope')).toEqual([]);
  });
});

describePilot('statement rows', () => {
  it('builds the Aktiva with numbering, hierarchy and printed values', () => {
    const rows = buildStatementRows(load(), 'balance_assets', '2024', '2023');
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));

    expect(rows[0].key).toBe('fixed_assets_total');
    expect(byKey['fixed_assets_total'].number).toBe('A.');
    expect(byKey['fixed_assets_total'].level).toBe(0);
    expect(byKey['fixed_assets_total'].hasChildren).toBe(true);
    expect(byKey['tangible_assets_total'].level).toBe(1);
    expect(byKey['land_buildings'].level).toBe(2);
    expect(byKey['land_buildings'].ancestors).toEqual(['tangible_assets_total', 'fixed_assets_total']);

    expect(byKey['total_assets'].current).toBeCloseTo(9926371.56, 2);
    expect(byKey['total_assets'].previous).toBeCloseTo(10454082.46, 2);
    expect(byKey['total_assets'].emphasis).toBe('total');
    expect(byKey['total_assets'].level).toBe(0);
  });

  it('keeps null values null and gives no change for them', () => {
    // Steuerrückstellungen are not broken out in the 2023 and 2024 reports.
    const row = buildStatementRows(load(), 'balance_liabilities', '2022', '2021').find(
      (r) => r.key === 'tax_provisions',
    )!;
    expect(row.current).not.toBeNull();
    const none = buildStatementRows(load(), 'balance_liabilities', '2024', '2023').find(
      (r) => r.key === 'tax_provisions',
    );
    expect(none?.current ?? null).toBeNull();
    expect(none?.previous ?? null).toBeNull();
    expect(none?.deltaAbs ?? null).toBeNull();
    expect(none?.deltaRel ?? null).toBeNull();
  });

  it('hides lines that the viewed report year does not print and prints the loss as that report did', () => {
    const dataset = load();
    const keys = (year: string, prev: string) =>
      buildStatementRows(dataset, 'income', year, prev).map((r) => r.key);
    expect(keys('2022', '2021')).toContain('balance_sheet_loss');
    expect(keys('2020', '2019')).not.toContain('balance_sheet_loss');
    const loss = (year: string, prev: string) =>
      buildStatementRows(dataset, 'income', year, prev).find((r) => r.key === 'net_result')!.current;
    expect(loss('2024', '2023')).toBeGreaterThan(0);
    expect(loss('2020', '2019')).toBeCloseTo(-1323315.57, 2);
  });

  it('shows the GuV as printed: the loss positive, the Bestandsveränderung with the printed sign', () => {
    const rows = buildStatementRows(load(), 'income', '2024', '2023');
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));

    expect(byKey['net_result'].current).toBeCloseTo(2051823.81, 2);
    expect(byKey['net_result'].previous).toBeCloseTo(2180384.72, 2);
    expect(byKey['net_result'].deltaAbs).toBeCloseTo(-128560.91, 2);

    expect(byKey['change_in_work_in_progress'].current).toBe(31300);
    expect(byKey['change_in_work_in_progress'].previous).toBe(-31300);
    // The sign flips between the years, so a relative change would say nothing.
    expect(byKey['change_in_work_in_progress'].deltaAbs).toBe(62600);
    expect(byKey['change_in_work_in_progress'].deltaRel).toBeNull();

    // Results that are printed with their economic sign stay as they are.
    expect(byKey['result_after_taxes'].current).toBeCloseTo(-2051423.81, 2);
    expect(byKey['income_taxes'].current).toBeCloseTo(-6744.61, 2);
  });

  it('nests the sub-items of the income statement', () => {
    const rows = buildStatementRows(load(), 'income', '2024', '2023');
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey['material_raw_supplies'].level).toBe(1);
    expect(byKey['material_raw_supplies'].number).toBe('a)');
    expect(byKey['pension_expenses'].level).toBe(2);
    expect(byKey['pension_expenses'].emphasis).toBe('memo');
    expect(byKey['revenue'].deltaRel).toBeCloseTo(0.1745, 3);
  });

  it('covers every figure of the Anhang that is shown on a statement', () => {
    const dataset = load();
    for (const view of dataset.views) {
      for (const statement of view.statements) {
        expect(buildStatementRows(dataset, statement, '2024', '2023').length, statement).toBeGreaterThan(0);
      }
    }
  });
});

describePilot('grouped model', () => {
  it('shows every selected period and can present the loss as a positive amount', () => {
    const model = buildGroupedModel(
      load(),
      [{ key: 'revenue' }, { key: 'net_result', negate: true }, { key: 'does_not_exist' }],
      'EUR',
      ['2023', '2024'],
    );
    expect(model?.periods).toEqual(['2023', '2024']);
    expect(model?.rows.map((r) => r.key)).toEqual(['revenue', 'net_result']);
    expect(model?.rows[1].values[0]).toBeCloseTo(2180384.72, 2);
    expect(model?.rows[1].values[1]).toBeCloseTo(2051823.81, 2);
  });

  it('returns nothing when no period is selected', () => {
    expect(buildGroupedModel(load(), [{ key: 'revenue' }], 'EUR', [])).toBeNull();
  });
});

describePilot('multi-year dataset', () => {
  it('has an own report for 2019-2024 and a comparison-only 2018', async () => {
    const { selectablePeriods, sourceFor, previousPeriodId } = await import('./dataset');
    const dataset = load();
    expect(selectablePeriods(dataset).map((p) => p.id)).toEqual(['2019', '2020', '2021', '2022', '2023', '2024']);
    expect(sourceFor(dataset, '2020')?.title).toMatch(/2020/);
    expect(previousPeriodId(dataset, '2019')).toBe('2018');
    expect(dataset.entity.formerNames?.length).toBeGreaterThan(0);
  });

  it('builds cards and models for every selectable year without errors', async () => {
    const { selectablePeriods } = await import('./dataset');
    const { buildTrendModel } = await import('./grouped');
    const dataset = load();
    for (const { id } of selectablePeriods(dataset)) {
      expect(buildKpiCards(dataset, 'balance', id).length).toBeGreaterThan(0);
      expect(buildKpiCards(dataset, 'income', id).length).toBeGreaterThan(0);
    }
    const trend = buildTrendModel(dataset, [{ key: 'revenue' }])!;
    expect(trend.categories).toHaveLength(7);
    expect(trend.series[0].values.every((v) => v !== null)).toBe(true);
  });

  it('never exposes the working title in the dataset text shown to users', () => {
    const text = JSON.stringify(load()).toLowerCase();
    expect(text).not.toContain('report monitor');
    expect(text).not.toContain('report-monitor');
  });
});

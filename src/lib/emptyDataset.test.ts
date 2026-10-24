import { describe, expect, it } from 'vitest';
import { isEmptyDataset, parseDataset } from './dataset';
import { emptyDataset } from './emptyDataset';
import { buildGenericCards, buildGenericTrend, chartableFacts, factsOfView } from './genericView';
import type { Dataset } from '../types';
import { validateDataset } from './validate';

/** A small invented dataset (no file in the repository) for the generic view tests. */
function inventedDataset(): Dataset {
  return {
    schemaVersion: '0.4',
    entity: { id: 'beispiel', name: 'Beispiel GmbH (fiktive Daten)' },
    sources: [{ period: '2024', title: 'Erfundene Zahlen', extraction: 'upload' }],
    periods: [
      { id: '2021', start: '2021-01-01', end: '2021-12-31' },
      { id: '2022', start: '2022-01-01', end: '2022-12-31' },
      { id: '2023', start: '2023-01-01', end: '2023-12-31' },
      { id: '2024', start: '2024-01-01', end: '2024-12-31' },
    ],
    conventions: { currency: 'EUR', tolerance: 0.01 },
    statements: { data: { labelDe: 'Daten' } },
    views: [{ id: 'data', labelDe: 'Daten', statements: ['data'] }],
    facts: [
      {
        key: 'revenue',
        statement: 'data',
        labelDe: 'Umsatzerlöse',
        unit: 'EUR',
        values: { '2021': 100, '2022': 110, '2023': 121, '2024': 133.1 },
      },
      {
        key: 'costs',
        statement: 'data',
        labelDe: 'Aufwand',
        unit: 'EUR',
        values: { '2021': 60, '2022': 66, '2023': 72.6, '2024': 79.86 },
      },
      {
        key: 'result',
        statement: 'data',
        labelDe: 'Ergebnis',
        unit: 'EUR',
        values: { '2021': 40, '2022': 44, '2023': 48.4, '2024': 53.24 },
      },
      {
        key: 'headcount',
        statement: 'data',
        labelDe: 'Beschäftigte',
        unit: 'count',
        values: { '2021': 10, '2022': 11, '2023': 12, '2024': 13 },
      },
    ],
    derivedKpis: [],
    checks: [
      {
        id: 'result_check',
        labelDe: 'Ergebnis = Umsatz − Aufwand',
        lhs: 'revenue - costs',
        rhs: 'result',
      },
    ],
  };
}

describe('empty start view (no data loaded)', () => {
  it('is a valid dataset with the full statement structure and no figures', () => {
    const report = validateDataset(emptyDataset);
    expect(report.results).toHaveLength(0);
    expect(isEmptyDataset(emptyDataset)).toBe(true);
    expect(emptyDataset.facts.length).toBeGreaterThan(50);
    for (const fact of emptyDataset.facts) expect(fact.values).toEqual({});
  });

  it('keeps every statement of the layout, so all boxes have rows', () => {
    const statements = new Set(emptyDataset.facts.map((f) => f.statement));
    expect([...statements].sort()).toEqual(['balance_assets', 'balance_liabilities', 'income', 'notes']);
    const views = emptyDataset.views.map((v) => v.id);
    expect(views).toContain('balance');
    expect(views).toContain('income');
    expect(views).toContain('anlagespiegel');
  });

  it('reads every figure as "–" (null) for both placeholder years', () => {
    const facts = factsOfView(emptyDataset, ['balance_assets']);
    const card = buildGenericCards(facts, emptyDataset, emptyDataset.periods[1].id)[0];
    expect(card.value).toBe('–');
  });
});

describe('invented dataset (fiktive Zahlen)', () => {
  it('is a valid dataset and passes its check in every year', () => {
    const dataset = parseDataset(inventedDataset());
    const report = validateDataset(dataset);
    expect(report.results).toHaveLength(dataset.periods.length);
    expect(report.ok).toBe(true);
    expect(report.skipped).toBe(0);
    expect(isEmptyDataset(dataset)).toBe(false);
  });

  it('detects a tampered value', () => {
    const dataset = parseDataset(inventedDataset());
    dataset.facts.find((f) => f.key === 'result')!.values['2023'] = 1;
    const failed = validateDataset(dataset).results.filter((r) => r.status === 'fail');
    expect(failed.map((r) => r.period)).toEqual(['2023']);
  });

  it('feeds the generic view: cards, a chart on one unit, no foreign data', () => {
    const dataset = parseDataset(inventedDataset());
    const facts = factsOfView(dataset, dataset.views[0].statements);
    const cards = buildGenericCards(facts, dataset, '2024');
    expect(cards).toHaveLength(4);
    expect(cards[0].label).toBe('Umsatzerlöse');
    const chartable = chartableFacts(facts)!;
    expect(chartable.unit).toBe('EUR');
    expect(chartable.facts.map((f) => f.key)).not.toContain('headcount');
    expect(buildGenericTrend(dataset, chartable.facts, 'EUR')?.categories).toEqual(['2021', '2022', '2023', '2024']);
  });
});

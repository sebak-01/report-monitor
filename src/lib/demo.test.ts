import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDataset } from './dataset';
import { buildGenericCards, buildGenericTrend, chartableFacts, factsOfView } from './genericView';
import { validateDataset } from './validate';

const load = () =>
  parseDataset(JSON.parse(readFileSync(new URL('../../public/data/demo.json', import.meta.url), 'utf-8')));

describe('bundled demo dataset (invented figures)', () => {
  it('is a valid dataset and passes its check in every year', () => {
    const dataset = load();
    const report = validateDataset(dataset);
    expect(report.results).toHaveLength(dataset.periods.length);
    expect(report.ok).toBe(true);
    expect(report.skipped).toBe(0);
  });

  it('detects a tampered value', () => {
    const dataset = load();
    dataset.facts.find((f) => f.key === 'revenue')!.values['2023'] = 1;
    const failed = validateDataset(dataset).results.filter((r) => r.status === 'fail');
    expect(failed.map((r) => r.period)).toEqual(['2023']);
  });

  it('feeds the generic view: cards, a chart on one unit, no foreign data', () => {
    const dataset = load();
    const facts = factsOfView(dataset, dataset.views[0].statements);
    const cards = buildGenericCards(facts, dataset, '2024');
    expect(cards).toHaveLength(4);
    expect(cards[0].label).toBe('Umsatzerlöse');
    const chartable = chartableFacts(facts)!;
    expect(chartable.unit).toBe('EUR');
    expect(chartable.facts.map((f) => f.key)).not.toContain('headcount');
    expect(buildGenericTrend(dataset, chartable.facts, 'EUR')?.categories).toEqual(['2021', '2022', '2023', '2024']);
    expect(dataset.entity.name).toBe('Beispiel GmbH (fiktive Daten)');
  });
});

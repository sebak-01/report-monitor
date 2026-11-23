import { describe, expect, it } from 'vitest';
import { cagr, flagOutliers, indexSeries, yoyChanges, yoyPercentSeries } from './timeseries';
import type { SeriesPoint } from './types';

const series = (values: Record<string, number | null>): SeriesPoint[] =>
  Object.entries(values).map(([periodId, value]) => ({ periodId, value }));

describe('yoyChanges', () => {
  it('computes absolute and relative change against the previous point', () => {
    const changes = yoyChanges(series({ '2021': 100, '2022': 110, '2023': 99 }));
    expect(changes[0]).toEqual({ periodId: '2021', abs: null, rel: null });
    expect(changes[1]).toEqual({ periodId: '2022', abs: 10, rel: 0.1 });
    expect(changes[2]!.abs).toBeCloseTo(-11);
    expect(changes[2]!.rel).toBeCloseTo(-0.1);
  });

  it('stays null when a value is missing', () => {
    const changes = yoyChanges(series({ '2021': 100, '2022': null, '2023': 120 }));
    expect(changes[1]).toEqual({ periodId: '2022', abs: null, rel: null });
    expect(changes[2]).toEqual({ periodId: '2023', abs: null, rel: null });
  });

  it('suppresses the relative change on a sign flip or zero base', () => {
    const flip = yoyChanges(series({ '2021': 10, '2022': -5 }));
    expect(flip[1]!.abs).toBe(-15);
    expect(flip[1]!.rel).toBeNull();
    const zero = yoyChanges(series({ '2021': 0, '2022': 5 }));
    expect(zero[1]!.abs).toBe(5);
    expect(zero[1]!.rel).toBeNull();
  });
});

describe('yoyPercentSeries', () => {
  it('returns percent points for the chart mode', () => {
    const points = yoyPercentSeries(series({ '2021': 200, '2022': 220 }));
    expect(points[0]!.value).toBeNull();
    expect(points[1]!.value).toBeCloseTo(10);
  });
});

describe('indexSeries', () => {
  it('indexes the series to the base year', () => {
    const points = indexSeries(series({ '2019': 200, '2020': 300, '2021': null }), '2019');
    expect(points).toEqual([
      { periodId: '2019', value: 100 },
      { periodId: '2020', value: 150 },
      { periodId: '2021', value: null },
    ]);
  });

  it('returns null when the base year has no usable value', () => {
    expect(indexSeries(series({ '2019': null, '2020': 300 }), '2019')).toBeNull();
    expect(indexSeries(series({ '2019': 0, '2020': 300 }), '2019')).toBeNull();
    expect(indexSeries(series({ '2020': 300 }), '2019')).toBeNull();
  });
});

describe('cagr', () => {
  it('computes the compound annual growth rate over the full series', () => {
    const rate = cagr(series({ '2020': 100, '2021': 120, '2022': 150, '2023': 180, '2024': 200 }));
    expect(rate).toBeCloseTo(2 ** (1 / 4) - 1);
  });

  it('is null without a meaningful base', () => {
    expect(cagr(series({ '2024': 100 }))).toBeNull();
    expect(cagr(series({ '2023': 0, '2024': 100 }))).toBeNull();
    expect(cagr(series({ '2023': -100, '2024': 100 }))).toBeNull();
    expect(cagr(series({ '2023': 100, '2024': null }))).toBeNull();
  });
});

describe('flagOutliers', () => {
  it('flags points far from the series mean', () => {
    const flags = flagOutliers(series({ '2020': 10, '2021': 10, '2022': 10, '2023': 10, '2024': 40 }));
    expect(flags).toHaveLength(1);
    expect(flags[0]!.periodId).toBe('2024');
    expect(flags[0]!.z).toBeGreaterThan(1.9);
  });

  it('flags nothing for short or constant series', () => {
    expect(flagOutliers(series({ '2023': 10, '2024': 40 }))).toEqual([]);
    expect(flagOutliers(series({ '2022': 5, '2023': 5, '2024': 5 }))).toEqual([]);
  });

  it('respects the configurable threshold', () => {
    const values = series({ '2020': 10, '2021': 10, '2022': 10, '2023': 10, '2024': 40 });
    expect(flagOutliers(values, 10)).toEqual([]);
  });
});

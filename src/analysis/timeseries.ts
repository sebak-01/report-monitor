/**
 * Time series helpers: year-over-year change, CAGR, index series and simple
 * outlier flags. All functions are pure and null-safe: a missing value stays a
 * gap (`null`), it is never treated as 0.
 */

import type { OutlierFlag, SeriesPoint, YearChange } from './types';

/** Deviation from the series mean (in standard deviations) that flags an outlier. */
export const OUTLIER_Z_THRESHOLD = 2;

/** Minimum number of values before a z-score is meaningful. */
const MIN_OUTLIER_POINTS = 3;

/**
 * Change of each point against its predecessor. The relative change is
 * suppressed when the base is zero or the sign flips (a swing from profit to
 * loss has no meaningful percentage), matching the statement tables.
 */
export function yoyChanges(series: SeriesPoint[]): YearChange[] {
  return series.map((point, index) => {
    if (index === 0) return { periodId: point.periodId, abs: null, rel: null };
    const previous = series[index - 1].value;
    const current = point.value;
    if (current === null || previous === null) return { periodId: point.periodId, abs: null, rel: null };
    const abs = current - previous;
    const rel =
      previous === 0 || (previous > 0 && current < 0) || (previous < 0 && current > 0)
        ? null
        : abs / Math.abs(previous);
    return { periodId: point.periodId, abs, rel };
  });
}

/**
 * Change against the previous year in percent points (12.5 = +12.5 %), for
 * the chart mode "Veränderung zum Vorjahr". The first point is null.
 */
export function yoyPercentSeries(series: SeriesPoint[]): SeriesPoint[] {
  return yoyChanges(series).map((change) => ({
    periodId: change.periodId,
    value: change.rel === null ? null : change.rel * 100,
  }));
}

/**
 * Index series with the base year = 100. Returns null when the base period has
 * no usable value (nothing to index against).
 */
export function indexSeries(series: SeriesPoint[], basePeriodId: string): SeriesPoint[] | null {
  const base = series.find((point) => point.periodId === basePeriodId)?.value ?? null;
  if (base === null || base === 0) return null;
  return series.map((point) => ({
    periodId: point.periodId,
    value: point.value === null ? null : (point.value / base) * 100,
  }));
}

/**
 * Compound annual growth rate over the full series as a fraction
 * (0.08 = +8 % per year). Null when there are fewer than two points or when an
 * endpoint is missing or not positive (a CAGR over zero or negative values is
 * not meaningful).
 */
export function cagr(series: SeriesPoint[]): number | null {
  if (series.length < 2) return null;
  const first = series[0].value;
  const last = series[series.length - 1].value;
  if (first === null || last === null || first <= 0 || last <= 0) return null;
  const years = series.length - 1;
  return (last / first) ** (1 / years) - 1;
}

/**
 * Flags points far from the series mean using the z-score
 * (deviation in standard deviations). Needs at least `MIN_OUTLIER_POINTS`
 * values; a constant series has no outliers.
 */
export function flagOutliers(
  series: SeriesPoint[],
  threshold: number = OUTLIER_Z_THRESHOLD,
): OutlierFlag[] {
  const values = series.map((point) => point.value).filter((v): v is number => v !== null);
  if (values.length < MIN_OUTLIER_POINTS) return [];
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  if (std === 0) return [];
  const flags: OutlierFlag[] = [];
  for (const point of series) {
    if (point.value === null) continue;
    const z = (point.value - mean) / std;
    if (Math.abs(z) >= threshold) flags.push({ periodId: point.periodId, z });
  }
  return flags;
}

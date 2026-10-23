import type { Dataset } from '../types';
import { createLookup, sortedPeriods } from './dataset';

export interface GroupedRow {
  key: string;
  label: string;
  /** One value per selected period, in the order of `periods`. */
  values: (number | null)[];
}

export interface GroupedModel {
  /** Selected period ids, oldest first. */
  periods: string[];
  unit: 'EUR' | 'TEUR';
  rows: GroupedRow[];
}

export interface GroupedItem {
  key: string;
  /** Overrides the label of the fact. */
  label?: string;
  /** Show a negative stored value as a positive amount (e.g. a loss). */
  negate?: boolean;
}

/**
 * Rows for a chart that compares the given periods (oldest first). Returns null
 * when no period is selected. Keys that are not in the dataset are skipped.
 */
export function buildGroupedModel(
  dataset: Dataset,
  items: GroupedItem[],
  unit: 'EUR' | 'TEUR',
  periodIds: string[],
): GroupedModel | null {
  if (periodIds.length === 0) return null;

  const lookup = createLookup(dataset);
  const labels = new Map(dataset.facts.map((f) => [f.key, f.labelDe]));
  const read = (key: string, periodId: string, negate: boolean | undefined): number | null => {
    const value = lookup(key, periodId);
    if (value === null || value === undefined) return null;
    return negate ? -value : value;
  };

  const rows: GroupedRow[] = items
    .filter((item) => labels.has(item.key))
    .map((item) => ({
      key: item.key,
      label: item.label ?? (labels.get(item.key) as string),
      values: periodIds.map((id) => read(item.key, id, item.negate)),
    }));

  return { periods: [...periodIds], unit, rows };
}

export interface StackedSeries {
  key: string;
  name: string;
  /** One value per category, in the order of `categories`. */
  values: (number | null)[];
}

export interface StackedModel {
  /** Period labels, oldest first. */
  categories: string[];
  series: StackedSeries[];
}

/**
 * Parts of a whole for the given periods (oldest first), e.g. the main items of
 * the Aktiva. Returns null when no period is selected.
 */
export function buildStackedModel(dataset: Dataset, items: GroupedItem[], periodIds: string[]): StackedModel | null {
  if (periodIds.length === 0) return null;

  const lookup = createLookup(dataset);
  const labels = new Map(dataset.facts.map((f) => [f.key, f.labelDe]));
  const read = (key: string, periodId: string): number | null => {
    const value = lookup(key, periodId);
    return value === undefined ? null : value;
  };

  return {
    categories: [...periodIds],
    series: items
      .filter((item) => labels.has(item.key))
      .map((item) => ({
        key: item.key,
        name: item.label ?? (labels.get(item.key) as string),
        values: periodIds.map((id) => read(item.key, id)),
      })),
  };
}

export interface TrendSeries {
  key: string;
  name: string;
  /** One value per category; `null` leaves a gap in the line. */
  values: (number | null)[];
}

export interface TrendModel {
  /** Number formats of the axis and tooltip. Without it the chart uses millions of euros. */
  format?: { axisName: string; tick: (v: number) => string; value: (v: number) => string };
  /** Period labels, oldest first. */
  categories: string[];
  series: TrendSeries[];
}

/** Values of the given items over all periods of the dataset, oldest first (for a line chart). */
export function buildTrendModel(dataset: Dataset, items: GroupedItem[]): TrendModel | null {
  const periods = sortedPeriods(dataset);
  if (periods.length < 2) return null;
  const lookup = createLookup(dataset);
  const labels = new Map(dataset.facts.map((f) => [f.key, f.labelDe]));
  const series = items
    .filter((item) => labels.has(item.key))
    .map((item) => ({
      key: item.key,
      name: item.label ?? (labels.get(item.key) as string),
      values: periods.map((p) => {
        const value = lookup(item.key, p.id);
        if (value === null || value === undefined) return null;
        return item.negate ? -value : value;
      }),
    }));
  return { categories: periods.map((p) => p.id), series };
}

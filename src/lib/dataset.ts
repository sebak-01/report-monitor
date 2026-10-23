import type { Dataset, Period, SourceDoc } from '../types';

export class DatasetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatasetError';
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function requireArray(raw: Record<string, unknown>, field: string): unknown[] {
  const value = raw[field];
  if (!Array.isArray(value)) throw new DatasetError(`Field "${field}" must be an array`);
  return value;
}

/** Schema 0.2 had one `source` for the whole dataset; 0.3 has one entry per period in `sources`. */
function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  if ('sources' in raw || !isRecord(raw.source) || !Array.isArray(raw.periods)) return raw;
  const { source, ...rest } = raw;
  const sources = (raw.periods as unknown[])
    .filter(isRecord)
    .map((p) => ({ ...source, period: p.id }));
  return { ...rest, schemaVersion: '0.3', sources };
}

/**
 * Runtime shape check for dataset files. Datasets will later come from
 * uploads, so the structure is verified before the rest of the app touches it.
 * This checks structure, not accounting: reconciliation lives in validate.ts.
 */
export function parseDataset(input: unknown): Dataset {
  if (!isRecord(input)) throw new DatasetError('Dataset must be a JSON object');
  const raw = migrate(input);

  if (!isRecord(raw.entity) || typeof raw.entity.name !== 'string') {
    throw new DatasetError('Field "entity.name" is required');
  }
  const sources = requireArray(raw, 'sources');
  for (const source of sources) {
    if (!isRecord(source) || typeof source.period !== 'string' || typeof source.title !== 'string') {
      throw new DatasetError('Every source needs string fields "period" and "title"');
    }
  }
  if (!isRecord(raw.conventions)) throw new DatasetError('Field "conventions" is required');

  if (!isRecord(raw.statements)) throw new DatasetError('Field "statements" is required');
  const views = requireArray(raw, 'views');
  if (views.length === 0) throw new DatasetError('At least one view is required');
  for (const v of views) {
    if (
      !isRecord(v) ||
      typeof v.id !== 'string' ||
      typeof v.labelDe !== 'string' ||
      !Array.isArray(v.statements)
    ) {
      throw new DatasetError('Every view needs "id", "labelDe" and a "statements" array');
    }
  }

  const periods = requireArray(raw, 'periods');
  if (periods.length === 0) throw new DatasetError('At least one period is required');
  for (const p of periods) {
    if (!isRecord(p) || typeof p.id !== 'string' || typeof p.end !== 'string') {
      throw new DatasetError('Every period needs string fields "id" and "end"');
    }
  }

  for (const f of requireArray(raw, 'facts')) {
    if (!isRecord(f) || typeof f.key !== 'string' || !isRecord(f.values)) {
      throw new DatasetError('Every fact needs a string "key" and an object "values"');
    }
    for (const v of Object.values(f.values)) {
      if (v !== null && typeof v !== 'number') {
        throw new DatasetError(`Fact "${f.key}" has a value that is neither a number nor null`);
      }
    }
  }

  for (const k of requireArray(raw, 'derivedKpis')) {
    if (!isRecord(k) || typeof k.key !== 'string' || typeof k.formula !== 'string') {
      throw new DatasetError('Every derived KPI needs string fields "key" and "formula"');
    }
  }

  for (const c of requireArray(raw, 'checks')) {
    if (
      !isRecord(c) ||
      typeof c.id !== 'string' ||
      typeof c.lhs !== 'string' ||
      typeof c.rhs !== 'string'
    ) {
      throw new DatasetError('Every check needs string fields "id", "lhs" and "rhs"');
    }
  }

  return raw as unknown as Dataset;
}

export async function fetchDataset(url: string): Promise<Dataset> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new DatasetError(`Could not load ${url} (HTTP ${response.status})`);
  }
  return parseDataset(await response.json());
}

/**
 * Looks up a fact value.
 *  - `undefined`: the key does not exist in the dataset
 *  - `null`: the key exists, but there is no value for that period
 */
export type ValueLookup = (key: string, periodId: string) => number | null | undefined;

export function createLookup(dataset: Dataset): ValueLookup {
  const byKey = new Map(dataset.facts.map((fact) => [fact.key, fact.values]));
  return (key, periodId) => {
    const values = byKey.get(key);
    if (!values) return undefined;
    const value = values[periodId];
    return value === undefined ? null : value;
  };
}

/** Periods in chronological order (oldest first). */
export function sortedPeriods(dataset: Dataset): Period[] {
  return [...dataset.periods].sort((a, b) => a.end.localeCompare(b.end));
}

export function latestPeriodId(dataset: Dataset): string | null {
  const periods = sortedPeriods(dataset);
  return periods.length > 0 ? periods[periods.length - 1].id : null;
}

export function previousPeriodId(dataset: Dataset, periodId: string): string | null {
  const periods = sortedPeriods(dataset);
  const index = periods.findIndex((p) => p.id === periodId);
  return index > 0 ? periods[index - 1].id : null;
}

/** Periods that have their own report, oldest first. These can be selected in the dashboard. */
export function selectablePeriods(dataset: Dataset): Period[] {
  return sortedPeriods(dataset).filter((p) => !p.comparisonOnly);
}

/** The report a period's figures come from. */
export function sourceFor(dataset: Dataset, periodId: string): SourceDoc | undefined {
  return dataset.sources.find((s) => s.period === periodId);
}

/** True when a note or redaction (with optional `periods`) applies to the period. */
export function appliesTo(item: { periods?: string[] }, periodId: string): boolean {
  return !item.periods || item.periods.includes(periodId);
}

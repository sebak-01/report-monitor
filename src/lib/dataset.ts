import type { Dataset, Period, SourceDoc } from '../types';
import { parseNumber } from './upload/numbers';

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
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new DatasetError(`Das Feld "${field}" muss eine Liste sein`);
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
 * Fact values must be JSON numbers or null. Hand-edited datasets
 * often carry German amounts as text ("2.672.461,76"); these are normalized.
 */
function normalizeValue(factKey: string, value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new DatasetError(`Der Wert von "${factKey}" ist keine endliche Zahl`);
    }
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseNumber(value, 'de') ?? parseNumber(value, 'en');
    if (parsed === undefined || parsed === null) {
      throw new DatasetError(`Der Wert von "${factKey}" ist weder eine Zahl noch null („${value}")`);
    }
    return parsed;
  }
  throw new DatasetError(`Der Wert von "${factKey}" ist weder eine Zahl noch null`);
}

/**
 * Runtime shape check for dataset files. Datasets will later come from
 * uploads, so the structure is verified before the rest of the app touches it.
 * This checks structure, not accounting: reconciliation lives in validate.ts.
 */
export function parseDataset(input: unknown): Dataset {
  if (!isRecord(input)) throw new DatasetError('Der Datensatz muss ein JSON-Objekt sein');
  const raw = migrate(input);

  if (!isRecord(raw.entity) || typeof raw.entity.name !== 'string') {
    throw new DatasetError('Das Feld "entity.name" ist erforderlich');
  }
  const sources = requireArray(raw, 'sources');
  for (const source of sources) {
    if (!isRecord(source) || typeof source.period !== 'string' || typeof source.title !== 'string') {
      throw new DatasetError('Jede Quelle braucht die Textfelder "period" und "title"');
    }
  }
  if (!isRecord(raw.conventions)) throw new DatasetError('Das Feld "conventions" ist erforderlich');

  if (!isRecord(raw.statements)) throw new DatasetError('Das Feld "statements" ist erforderlich');
  const views = requireArray(raw, 'views');
  if (views.length === 0) throw new DatasetError('Mindestens eine Ansicht ist erforderlich');
  for (const v of views) {
    if (
      !isRecord(v) ||
      typeof v.id !== 'string' ||
      typeof v.labelDe !== 'string' ||
      !Array.isArray(v.statements)
    ) {
      throw new DatasetError('Jede Ansicht braucht "id", "labelDe" und die Liste "statements"');
    }
  }

  const periods = requireArray(raw, 'periods');
  if (periods.length === 0) throw new DatasetError('Mindestens eine Periode ist erforderlich');
  for (const p of periods) {
    if (!isRecord(p) || typeof p.id !== 'string' || typeof p.end !== 'string') {
      throw new DatasetError('Jede Periode braucht die Textfelder "id" und "end"');
    }
  }

  const facts = requireArray(raw, 'facts');
  for (const f of facts) {
    if (!isRecord(f) || typeof f.key !== 'string' || !isRecord(f.values)) {
      throw new DatasetError('Jede Position braucht ein Textfeld "key" und das Objekt "values"');
    }
    for (const [periodId, value] of Object.entries(f.values)) {
      f.values[periodId] = normalizeValue(`${f.key} (${periodId})`, value);
    }
  }
  const factKeys = new Set<string>();
  for (const f of facts) {
    const key = (f as Record<string, unknown>).key as string;
    if (factKeys.has(key)) {
      throw new DatasetError(`Doppelter Positionsschlüssel "${key}"`);
    }
    factKeys.add(key);
  }

  const derivedKpis = requireArray(raw, 'derivedKpis');
  for (const k of derivedKpis) {
    if (!isRecord(k) || typeof k.key !== 'string' || typeof k.formula !== 'string') {
      throw new DatasetError('Jede Kennzahl braucht die Textfelder "key" und "formula"');
    }
  }

  const checks = requireArray(raw, 'checks');
  for (const c of checks) {
    if (
      !isRecord(c) ||
      typeof c.id !== 'string' ||
      typeof c.lhs !== 'string' ||
      typeof c.rhs !== 'string'
    ) {
      throw new DatasetError('Jede Prüfung braucht die Textfelder "id", "lhs" und "rhs"');
    }
  }

  // A leftover "schedules" key of older dataset files is dropped, not passed on.
  const { schedules: _schedules, ...rest } = raw;
  return {
    ...(rest as unknown as Dataset),
    sources: sources as SourceDoc[],
    periods: periods as Period[],
    facts: facts as Dataset['facts'],
    derivedKpis: derivedKpis as Dataset['derivedKpis'],
    checks: checks as Dataset['checks'],
  };
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

/** True when the dataset carries no figures at all (the empty start view). */
export function isEmptyDataset(dataset: Dataset): boolean {
  return !dataset.facts.some((f) => Object.values(f.values).some((v) => v !== null && v !== undefined));
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

/**
 * Merging uploads of the same company into one stored dataset.
 *
 * `mergeDatasets` combines two datasets of one company at value level; the rules
 * follow `buildDataset.putValue`: a period's own report wins over a prior-year
 * column (in either direction of upload), a newer import wins over the stored
 * values of the same year, gaps are filled and differences are reported.
 *
 * `importReports` / `importDataset` pick the merge strategy for an import:
 * report extracts can be rebuilt from scratch (identical to dropping all files
 * at once), everything else is merged at dataset level.
 */
import type { Check, Dataset, DerivedKpi, Fact, Note, Period, Redaction, Schedule, ScheduleRow, SourceDoc, ViewMeta } from '../../types';
import { buildDataset, combineReports, type ParsedReport } from '../extract/buildDataset';
import { sameEntityAny } from './entityMatch';
import { DEDICATED_VIEWS, withGenericView } from './renderable';
import { newDatasetId, type StoredDataset } from './storage';

const EPSILON = 0.05;

export interface MergeResult {
  dataset: Dataset;
  warnings: string[];
}

/** Names a stored dataset is known under: display name, entity name, former names. */
export function knownNames(item: { name: string; dataset: Dataset }): string[] {
  return [item.name, item.dataset.entity.name, ...(item.dataset.entity.formerNames ?? []).map((f) => f.name)];
}

/** Stored datasets that belong to one of `incomingNames`. */
export function matchCandidates<T extends { name: string; dataset: Dataset }>(stored: T[], incomingNames: string[]): T[] {
  return stored.filter((item) => incomingNames.some((n) => sameEntityAny(n, knownNames(item))));
}

/** File names of everything a stored item was built from (the list is comma-joined in `fileName`). */
export function storedFileNames(item: { fileName: string; reports?: ParsedReport[] }): string[] {
  if (item.reports?.length) return item.reports.map((r) => r.fileName);
  return item.fileName.split(', ');
}

type Winner = 'existing' | 'incoming';

/**
 * Which side wins for one period: a period's own report beats a prior-year
 * column, a newer import beats the stored values of the same year, and when
 * both sides only hold comparison values the existing ones stay.
 */
function winnerFor(periodId: string, incomingOwn: Set<string>): Winner {
  return incomingOwn.has(periodId) ? 'incoming' : 'existing';
}

function ownPeriods(dataset: Dataset): Set<string> {
  return new Set(dataset.periods.filter((p) => !p.comparisonOnly).map((p) => p.id));
}

function mergeCell(
  target: Record<string, number | null>,
  key: string,
  incoming: number | null | undefined,
  winner: Winner,
  label: string,
  warnings: string[],
): void {
  if (incoming === undefined) return;
  const current = target[key];
  if (current === undefined || current === null) {
    if (incoming !== null) target[key] = incoming;
    else if (current === undefined) target[key] = null;
    return;
  }
  if (incoming === null || Math.abs(current - incoming) <= EPSILON) return;
  warnings.push(
    `Abweichung für ${label} (${key}): ${current} aus dem vorhandenen Datensatz, ${incoming} aus dem neuen Import. Es gilt ${
      winner === 'incoming' ? 'der neue Import' : 'die vorhandene Quelle'
    }.`,
  );
  if (winner === 'incoming') target[key] = incoming;
}

function mergeValues(
  target: Record<string, number | null>,
  incoming: Record<string, number | null>,
  incomingOwn: Set<string>,
  label: string,
  warnings: string[],
): void {
  for (const [periodId, value] of Object.entries(incoming)) {
    mergeCell(target, periodId, value, winnerFor(periodId, incomingOwn), label, warnings);
  }
}

function mergeFacts(existing: Fact[], incoming: Fact[], incomingOwn: Set<string>, warnings: string[]): Fact[] {
  const out = existing.map((f) => ({ ...f, values: { ...f.values } }));
  const byKey = new Map(out.map((f) => [f.key, f]));
  for (const fact of incoming) {
    const target = byKey.get(fact.key);
    if (!target) {
      const created: Fact = { ...fact, values: { ...fact.values } };
      out.push(created);
      byKey.set(created.key, created);
      continue;
    }
    mergeValues(target.values, fact.values, incomingOwn, fact.key, warnings);
    if (fact.layouts) target.layouts = { ...fact.layouts, ...target.layouts };
    if (fact.absentIn) target.absentIn = [...new Set([...(target.absentIn ?? []), ...fact.absentIn])];
  }
  return out;
}

function mergeScheduleRow(target: ScheduleRow, row: ScheduleRow, incomingOwn: Set<string>, warnings: string[]): void {
  for (const [periodId, cells] of Object.entries(row.values)) {
    if (!target.values[periodId]) {
      target.values[periodId] = { ...cells };
      continue;
    }
    for (const [col, value] of Object.entries(cells)) {
      mergeCell(target.values[periodId], col, value, winnerFor(periodId, incomingOwn), `${row.labelDe}, ${periodId}`, warnings);
    }
  }
  if (row.absentIn) target.absentIn = [...new Set([...(target.absentIn ?? []), ...row.absentIn])];
}

function mergeSchedules(
  existing: Schedule[] | undefined,
  incoming: Schedule[] | undefined,
  incomingOwn: Set<string>,
  warnings: string[],
): Schedule[] | undefined {
  if (!existing || existing.length === 0) return incoming ? (JSON.parse(JSON.stringify(incoming)) as Schedule[]) : undefined;
  if (!incoming) return existing;
  const out = JSON.parse(JSON.stringify(existing)) as Schedule[];
  for (const schedule of incoming) {
    const target = out.find((s) => s.id === schedule.id);
    if (!target) {
      out.push(JSON.parse(JSON.stringify(schedule)) as Schedule);
      continue;
    }
    for (const col of schedule.columns) {
      if (!target.columns.some((c) => c.key === col.key)) target.columns.push({ ...col });
    }
    for (const row of schedule.rows) {
      const match = target.rows.find((r) => r.key === row.key) ?? target.rows.find((r) => r.labelDe === row.labelDe);
      if (!match) {
        target.rows.push(JSON.parse(JSON.stringify(row)) as ScheduleRow);
        continue;
      }
      mergeScheduleRow(match, row, incomingOwn, warnings);
    }
  }
  return out;
}

function mergePeriods(existing: Period[], incoming: Period[], existingOwn: Set<string>, incomingOwn: Set<string>): Period[] {
  const out = existing.map((p) => ({ ...p }));
  const byId = new Map(out.map((p) => [p.id, p]));
  for (const period of incoming) {
    const target = byId.get(period.id);
    if (!target) {
      const created = { ...period };
      byId.set(created.id, created);
      out.push(created);
      continue;
    }
    if (incomingOwn.has(period.id) && !existingOwn.has(period.id)) {
      delete target.comparisonOnly;
      target.start = period.start;
      target.end = period.end;
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function mergeSources(existing: SourceDoc[], incoming: SourceDoc[], incomingOwn: Set<string>): SourceDoc[] {
  const out = existing.map((s) => ({ ...s }));
  for (const source of incoming) {
    const index = out.findIndex((s) => s.period === source.period);
    if (index < 0) out.push({ ...source });
    else if (incomingOwn.has(source.period)) out[index] = { ...source };
  }
  return out.sort((a, b) => a.period.localeCompare(b.period));
}

function mergeViews(existing: ViewMeta[], incoming: ViewMeta[]): ViewMeta[] {
  const out = existing.map((v) => ({ ...v, statements: [...v.statements] }));
  for (const view of incoming) {
    const target = out.find((v) => v.id === view.id);
    if (!target) {
      out.push({ ...view, statements: [...view.statements], schedules: view.schedules ? [...view.schedules] : undefined });
      continue;
    }
    target.statements = [...new Set([...target.statements, ...view.statements])];
    if (view.schedules) target.schedules = [...new Set([...(target.schedules ?? []), ...view.schedules])];
  }
  return out;
}

function unionBy<T>(existing: T[], incoming: T[], key: (item: T) => string): T[] {
  const out = [...existing];
  const seen = new Set(existing.map(key));
  for (const item of incoming) {
    const id = key(item);
    if (!seen.has(id)) {
      out.push(item);
      seen.add(id);
    }
  }
  return out;
}

function unionByText<T>(existing: T[], incoming: T[]): T[] {
  const out = [...existing];
  const seen = new Set(existing.map((item) => JSON.stringify(item)));
  for (const item of incoming) {
    const id = JSON.stringify(item);
    if (!seen.has(id)) {
      out.push(item);
      seen.add(id);
    }
  }
  return out;
}

function mergeFormerNames(existing: Dataset, incoming: Dataset, keptName: string): { name: string; until?: string }[] | undefined {
  const names = new Map<string, { name: string; until?: string }>();
  for (const former of [...(existing.entity.formerNames ?? []), ...(incoming.entity.formerNames ?? [])]) {
    if (former.name && former.name !== keptName && !names.has(former.name)) names.set(former.name, former);
  }
  for (const name of [existing.entity.name, incoming.entity.name]) {
    if (name && name !== keptName && !names.has(name)) names.set(name, { name });
  }
  return names.size > 0 ? [...names.values()] : undefined;
}

/** Combines two datasets of the same company into one multi-year dataset. */
export function mergeDatasets(existing: Dataset, incoming: Dataset): MergeResult {
  const warnings: string[] = [];
  const existingOwn = ownPeriods(existing);
  const incomingOwn = ownPeriods(incoming);

  const periods = mergePeriods(existing.periods, incoming.periods, existingOwn, incomingOwn);
  const facts = mergeFacts(existing.facts, incoming.facts, incomingOwn, warnings);
  const schedules = mergeSchedules(existing.schedules, incoming.schedules, incomingOwn, warnings);

  // Periods that only appear inside values (comparison columns) still need an entry.
  const known = new Set(periods.map((p) => p.id));
  for (const fact of facts) {
    for (const periodId of Object.keys(fact.values)) {
      if (known.has(periodId)) continue;
      known.add(periodId);
      periods.push({ id: periodId, start: `${periodId}-01-01`, end: `${periodId}-12-31`, comparisonOnly: true });
    }
  }
  periods.sort((a, b) => a.id.localeCompare(b.id));

  const notes = unionByText<Note>(existing.notes ?? [], incoming.notes ?? []);
  const redactions = unionByText<Redaction>(existing.redactions ?? [], incoming.redactions ?? []);
  const dataset: Dataset = {
    ...existing,
    entity: {
      ...existing.entity,
      formerNames: mergeFormerNames(existing, incoming, existing.entity.name),
    },
    sources: mergeSources(existing.sources, incoming.sources, incomingOwn),
    periods,
    statements: { ...incoming.statements, ...existing.statements },
    views: mergeViews(existing.views, incoming.views),
    facts,
    schedules: schedules && schedules.length > 0 ? schedules : undefined,
    derivedKpis: unionBy<DerivedKpi>(existing.derivedKpis ?? [], incoming.derivedKpis ?? [], (k) => k.key),
    checks: unionBy<Check>(existing.checks ?? [], incoming.checks ?? [], (c) => c.id),
    notes: notes.length > 0 ? notes : undefined,
    redactions: redactions.length > 0 ? redactions : undefined,
  };
  return { dataset, warnings };
}

function finalizeItem(target: StoredDataset | null, dataset: Dataset, name: string, fileName: string, reports?: ParsedReport[]): StoredDataset {
  const entityName = name.trim() || dataset.entity.name;
  return {
    id: target?.id ?? newDatasetId(),
    name: entityName,
    fileName,
    createdAt: new Date().toISOString(),
    reports,
    dataset: withGenericView({ ...dataset, entity: { ...dataset.entity, name: entityName } }, DEDICATED_VIEWS),
  };
}

/**
 * A report extract import. Report extracts are rebuilt from all reports behind
 * the stored dataset plus the new ones (identical to dropping all files at
 * once); a stored dataset built from something else is merged at value level.
 */
export function importReports(
  target: StoredDataset | null,
  reports: ParsedReport[],
  name: string,
): { item: StoredDataset; warnings: string[] } {
  const warnings: string[] = [];
  const fileName = reports.map((r) => r.fileName).join(', ');
  if (!target) {
    const built = buildDataset(reports);
    warnings.push(...built.warnings);
    return { item: finalizeItem(null, built.dataset, name, fileName, reports), warnings };
  }
  if (target.reports?.length) {
    const combined = combineReports(target.reports, reports);
    const built = buildDataset(combined);
    warnings.push(...built.warnings);
    return {
      item: finalizeItem(target, built.dataset, name, combined.map((r) => r.fileName).join(', '), combined),
      warnings,
    };
  }
  const built = buildDataset(reports);
  warnings.push(...built.warnings);
  const merged = mergeDatasets(target.dataset, built.dataset);
  warnings.push(...merged.warnings);
  return { item: finalizeItem(target, merged.dataset, name, [target.fileName, fileName].join(', ')), warnings };
}

/** A table or dataset-JSON import; merged at value level when it matches a stored dataset. */
export function importDataset(
  target: StoredDataset | null,
  dataset: Dataset,
  name: string,
  fileName: string,
): { item: StoredDataset; warnings: string[] } {
  if (!target) return { item: finalizeItem(null, dataset, name, fileName), warnings: [] };
  const merged = mergeDatasets(target.dataset, dataset);
  return {
    item: finalizeItem(target, merged.dataset, name, [target.fileName, fileName].join(', ')),
    warnings: merged.warnings,
  };
}

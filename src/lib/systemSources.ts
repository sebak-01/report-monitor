/**
 * Read-only sample datasets that ship with the site (public/data/). They are
 * fetched on demand and never written to IndexedDB: system sources stay
 * immutable, uploads create separate user-owned sources.
 */
import { parseDataset } from './dataset';
import type { Dataset } from '../types';

/** One entry of public/data/manifest.json. */
export interface SystemSourceMeta {
  id: string;
  file: string;
  name: string;
  entityName: string;
  periods: string[];
  sourcePortal?: string;
}

export interface SystemManifest {
  datasets: SystemSourceMeta[];
}

/** Active-source ids of system datasets look like `system:fgk`. */
export const SYSTEM_PREFIX = 'system:';

export function systemSourceId(meta: SystemSourceMeta): string {
  return `${SYSTEM_PREFIX}${meta.id}`;
}

export function systemIdOf(sourceId: string): string | null {
  return sourceId.startsWith(SYSTEM_PREFIX) ? sourceId.slice(SYSTEM_PREFIX.length) : null;
}

/** Resolved against the site base so the app works on any host path. */
function dataUrl(file: string): string {
  const base = import.meta.env.BASE_URL ?? './';
  return `${base.replace(/\/?$/, '/')}data/${file}`;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function parseManifest(json: unknown): SystemManifest {
  if (!isRecord(json) || !Array.isArray(json.datasets)) {
    throw new Error('Die Liste der Beispieldaten hat ein unerwartetes Format.');
  }
  const datasets = json.datasets.map((entry, i) => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== 'string' ||
      typeof entry.file !== 'string' ||
      typeof entry.name !== 'string' ||
      !Array.isArray(entry.periods)
    ) {
      throw new Error(`Der Beispieldatensatz Nr. ${i + 1} hat ein unerwartetes Format.`);
    }
    return {
      id: entry.id,
      file: entry.file,
      name: entry.name,
      entityName: typeof entry.entityName === 'string' ? entry.entityName : entry.name,
      periods: entry.periods.filter((p): p is string => typeof p === 'string'),
      sourcePortal: typeof entry.sourcePortal === 'string' ? entry.sourcePortal : undefined,
    } satisfies SystemSourceMeta;
  });
  return { datasets };
}

let manifestCache: SystemManifest | null = null;
const datasetCache = new Map<string, Dataset>();

/** The available sample datasets; cached after the first successful load. */
export async function fetchSystemManifest(): Promise<SystemManifest> {
  if (manifestCache) return manifestCache;
  const res = await fetch(dataUrl('manifest.json'));
  if (!res.ok) throw new Error(`Die Liste der Beispieldaten konnte nicht geladen werden (${res.status}).`);
  manifestCache = parseManifest(await res.json());
  return manifestCache;
}

/** The dataset behind one manifest entry; cached after the first successful load. */
export async function fetchSystemDataset(meta: SystemSourceMeta): Promise<Dataset> {
  const cached = datasetCache.get(meta.id);
  if (cached) return cached;
  const res = await fetch(dataUrl(meta.file));
  if (!res.ok) throw new Error(`Der Beispieldatensatz „${meta.name}“ konnte nicht geladen werden (${res.status}).`);
  const dataset = parseDataset(await res.json());
  datasetCache.set(meta.id, dataset);
  return dataset;
}

/** Test hook: drops the in-memory caches. */
export function resetSystemSourceCaches(): void {
  manifestCache = null;
  datasetCache.clear();
}

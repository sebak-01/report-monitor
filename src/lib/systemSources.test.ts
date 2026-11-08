import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchSystemDataset,
  fetchSystemManifest,
  resetSystemSourceCaches,
  systemIdOf,
  systemSourceId,
} from './systemSources';

const MANIFEST = {
  datasets: [
    {
      id: 'fgk',
      file: 'fgk.json',
      name: 'Forschungsinstitut für Glas - Keramik GmbH',
      periods: ['2023', '2024'],
      sourcePortal: 'https://open.rlp.de',
    },
    { id: 'ifos', file: 'ifos.json', name: 'Institut für Oberflächen- und Schichttechnik GmbH', periods: ['2024'] },
  ],
};

const DATASET = {
  schemaVersion: '0.3',
  entity: { name: 'Forschungsinstitut für Glas - Keramik GmbH' },
  conventions: { currency: 'EUR', sign: 'economic' },
  statements: { balance: {} },
  views: [{ id: 'balance', labelDe: 'Bilanz', statements: ['balance'] }],
  periods: [{ id: '2024', start: '2024-01-01', end: '2024-12-31' }],
  sources: [{ period: '2024', title: 'Jahresabschluss 2024', datasetUrl: 'https://open.rlp.de/dataset/x' }],
  facts: [{ key: 'total_assets', labelDe: 'Bilanzsumme', unit: 'EUR', values: { '2024': 100 } }],
};

function stubFetch(routes: Record<string, unknown>) {
  return vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      const hit = Object.entries(routes).find(([path]) => url.endsWith(path));
      if (!hit) return new Response('not found', { status: 404 });
      return new Response(JSON.stringify(hit[1]), { status: 200 });
    }),
  );
}

beforeEach(() => {
  resetSystemSourceCaches();
  stubFetch({ 'data/manifest.json': MANIFEST, 'data/fgk.json': DATASET });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('system source ids', () => {
  it('round-trips through the system: prefix', () => {
    const meta = { id: 'fgk', file: 'fgk.json', name: 'F', entityName: 'F', periods: [] };
    expect(systemSourceId(meta)).toBe('system:fgk');
    expect(systemIdOf('system:fgk')).toBe('fgk');
    expect(systemIdOf('upload-123')).toBeNull();
    expect(systemIdOf('builtin')).toBeNull();
  });
});

describe('fetchSystemManifest', () => {
  it('reads and normalises the manifest', async () => {
    const { datasets } = await fetchSystemManifest();
    expect(datasets.map((d) => d.id)).toEqual(['fgk', 'ifos']);
    expect(datasets[0].periods).toEqual(['2023', '2024']);
    expect(datasets[1].entityName).toBe('Institut für Oberflächen- und Schichttechnik GmbH');
    expect(datasets[1].sourcePortal).toBeUndefined();
  });

  it('caches the manifest instead of fetching twice', async () => {
    await fetchSystemManifest();
    await fetchSystemManifest();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a manifest with an unexpected shape', async () => {
    resetSystemSourceCaches();
    stubFetch({ 'data/manifest.json': { datasets: [{ id: 1 }] } });
    await expect(fetchSystemManifest()).rejects.toThrow(/unerwartetes Format/);
  });

  it('rejects when the manifest is missing', async () => {
    resetSystemSourceCaches();
    stubFetch({});
    await expect(fetchSystemManifest()).rejects.toThrow(/nicht geladen/);
  });
});

describe('fetchSystemDataset', () => {
  it('parses and validates the dataset JSON', async () => {
    const meta = (await fetchSystemManifest()).datasets[0];
    const dataset = await fetchSystemDataset(meta);
    expect(dataset.entity.name).toBe('Forschungsinstitut für Glas - Keramik GmbH');
    expect(dataset.sources[0].datasetUrl).toBe('https://open.rlp.de/dataset/x');
  });

  it('caches the dataset instead of fetching twice', async () => {
    const meta = (await fetchSystemManifest()).datasets[0];
    await fetchSystemDataset(meta);
    await fetchSystemDataset(meta);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid dataset instead of showing it', async () => {
    const meta = (await fetchSystemManifest()).datasets[0];
    resetSystemSourceCaches();
    stubFetch({ 'data/manifest.json': MANIFEST, 'data/fgk.json': { nope: true } });
    await expect(fetchSystemDataset({ ...meta })).rejects.toThrow();
  });
});

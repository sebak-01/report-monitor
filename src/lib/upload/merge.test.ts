import { describe, expect, it } from 'vitest';
import type { Dataset, Fact, Period, Schedule, SourceDoc } from '../../types';
import { parseReport } from '../extract/buildDataset';
import { importDataset, importReports, matchCandidates, mergeDatasets, storedFileNames } from './merge';

function fact(key: string, values: Record<string, number | null>): Fact {
  return { key, statement: 'income', labelDe: key, unit: 'EUR', values };
}

function ds(opts: {
  name: string;
  periods: Period[];
  facts: Fact[];
  sources?: SourceDoc[];
  schedules?: Schedule[];
  formerNames?: { name: string }[];
}): Dataset {
  return {
    schemaVersion: '0.4',
    entity: { id: 'muster', name: opts.name, formerNames: opts.formerNames },
    sources: opts.sources ?? [],
    periods: opts.periods,
    conventions: { currency: 'EUR' },
    statements: {},
    views: [],
    facts: opts.facts,
    schedules: opts.schedules,
    derivedKpis: [],
    checks: [],
  };
}

const own = (id: string): Period => ({ id, start: `${id}-01-01`, end: `${id}-12-31` });
const prior = (id: string): Period => ({ ...own(id), comparisonOnly: true });

// Report of 2022: own year 2022, prior-year column 2021.
const report2022 = ds({
  name: 'Muster Technik GmbH',
  periods: [prior('2021'), own('2022')],
  facts: [fact('revenue', { '2022': 100, '2021': 90 }), fact('book', { '2022': 500 })],
  sources: [{ period: '2022', title: 'Jahresabschluss 2022' }],
});

// Report of 2023: own year 2023, prior-year column 2022 (with a figure that differs from the 2022 report).
const report2023 = ds({
  name: 'Muster Technik GmbH',
  periods: [prior('2022'), own('2023')],
  facts: [fact('revenue', { '2023': 120, '2022': 105 })],
  sources: [{ period: '2023', title: 'Jahresabschluss 2023' }],
});

describe('mergeDatasets', () => {
  it('lets the report of the year win over a prior-year column, in either upload order', () => {
    for (const merged of [mergeDatasets(report2022, report2023), mergeDatasets(report2023, report2022)]) {
      const revenue = merged.dataset.facts.find((f) => f.key === 'revenue')!;
      expect(revenue.values['2022']).toBe(100);
      expect(revenue.values['2023']).toBe(120);
      expect(merged.warnings.join(' ')).toMatch(/Abweichung für revenue \(2022\)/);
      expect(merged.dataset.periods.map((p) => p.id)).toEqual(['2021', '2022', '2023']);
    }
  });

  it('marks periods own as soon as one side has its own report', () => {
    const merged = mergeDatasets(report2023, report2022);
    const period = merged.dataset.periods.find((p) => p.id === '2022')!;
    expect(period.comparisonOnly).toBeUndefined();
    expect(merged.dataset.periods.find((p) => p.id === '2021')!.comparisonOnly).toBe(true);
    expect(merged.dataset.sources.map((s) => s.period)).toEqual(['2022', '2023']);
  });

  it('fills gaps and never lets a null overwrite a figure', () => {
    const merged = mergeDatasets(report2022, report2023);
    expect(merged.dataset.facts.find((f) => f.key === 'book')!.values['2022']).toBe(500);
    const filled = mergeDatasets(
      ds({ name: 'X', periods: [own('2022')], facts: [fact('a', { '2022': null })] }),
      ds({ name: 'X', periods: [own('2022')], facts: [fact('a', { '2022': 5 })] }),
    );
    expect(filled.dataset.facts[0].values['2022']).toBe(5);
    const kept = mergeDatasets(
      ds({ name: 'X', periods: [own('2022')], facts: [fact('a', { '2022': 5 })] }),
      ds({ name: 'X', periods: [own('2022')], facts: [fact('a', { '2022': null })] }),
    );
    expect(kept.dataset.facts[0].values['2022']).toBe(5);
    expect(kept.warnings).toEqual([]);
  });

  it('lets a newer import win when both hold the same year as their own', () => {
    const merged = mergeDatasets(report2022, ds({ name: 'M', periods: [own('2022')], facts: [fact('revenue', { '2022': 110 })] }));
    expect(merged.dataset.facts.find((f) => f.key === 'revenue')!.values['2022']).toBe(110);
    expect(merged.warnings.join(' ')).toMatch(/Es gilt der neue Import/);
  });

  it('keeps the existing values when both hold comparison figures only', () => {
    const merged = mergeDatasets(
      ds({ name: 'X', periods: [prior('2021')], facts: [fact('a', { '2021': 1 })] }),
      ds({ name: 'X', periods: [prior('2021')], facts: [fact('a', { '2021': 2 })] }),
    );
    expect(merged.dataset.facts[0].values['2021']).toBe(1);
    expect(merged.warnings.join(' ')).toMatch(/Es gilt die vorhandene Quelle/);
  });

  it('adds unknown facts and keeps the stored label metadata', () => {
    const merged = mergeDatasets(
      ds({ name: 'X', periods: [own('2022')], facts: [{ ...fact('a', { '2022': 1 }), labelDe: 'Alt', absentIn: ['2020'] }] }),
      ds({
        name: 'X',
        periods: [own('2022')],
        facts: [{ ...fact('a', { '2022': 1 }), labelDe: 'Neu', absentIn: ['2021'] }, fact('b', { '2022': 2 })],
      }),
    );
    const a = merged.dataset.facts.find((f) => f.key === 'a')!;
    expect(a.labelDe).toBe('Alt');
    expect(a.absentIn).toEqual(['2020', '2021']);
    expect(merged.dataset.facts.find((f) => f.key === 'b')!.values['2022']).toBe(2);
  });

  it('collects former names when the display name changes', () => {
    const merged = mergeDatasets(
      ds({ name: 'Muster Technik GmbH', periods: [own('2022')], facts: [] }),
      ds({ name: 'Muster-Technik GmbH', periods: [own('2023')], facts: [] }),
    );
    expect(merged.dataset.entity.name).toBe('Muster Technik GmbH');
    expect(merged.dataset.entity.formerNames?.map((f) => f.name)).toEqual(['Muster-Technik GmbH']);
  });

  it('merges schedules row by row and column by column', () => {
    const schedule = (values: Record<string, Record<string, number | null>>, extraColumn = false): Schedule => ({
      id: 'anlagespiegel',
      labelDe: 'Anlagespiegel',
      unit: 'EUR',
      columns: [
        { key: 'cost-start', labelDe: 'AHK 01.01.', role: 'cost-start' },
        ...(extraColumn ? [{ key: 'additions', labelDe: 'Zugänge', role: 'additions' as const }] : []),
      ],
      rows: [{ key: 'machines', labelDe: 'Maschinen', values }],
    });
    const merged = mergeDatasets(
      ds({ name: 'X', periods: [own('2022')], facts: [], schedules: [schedule({ '2022': { 'cost-start': 100, additions: 10 } }, true)] }),
      ds({ name: 'X', periods: [own('2023')], facts: [], schedules: [schedule({ '2023': { 'cost-start': 110 }, '2022': { 'cost-start': 105 } })] }),
    );
    const row = merged.dataset.schedules![0].rows[0];
    expect(row.values['2022']['cost-start']).toBe(100);
    expect(row.values['2023']['cost-start']).toBe(110);
    expect(merged.dataset.schedules![0].columns.map((c) => c.key)).toEqual(['cost-start', 'additions']);
  });
});

describe('importReports', () => {
  const de = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const extractOf = (year: string, revenue: number, priorRevenue: number) => ({
    source_url: `https://example.org/${year}.pdf`,
    pages: [
      {
        page_number: 1,
        text:
          `Bilanz zum 31.12.${year}\nMuster Technik GmbH, Musterstadt\nAKTIVA PASSIVA\n` +
          `1. Umsatzerlöse ${de(revenue)} ${de(priorRevenue)}\n` +
          `Summe Anlagevermögen 500,00 550,00\n500,00 550,00 500,00 550,00\n`,
      },
    ],
  });

  it('adds a later report to a stored source and keeps its id and name', () => {
    const first = importReports(null, [parseReport(extractOf('2022', 100, 90), 'y2022_extracted.json')], 'Muster Technik GmbH');
    expect(first.item.reports).toHaveLength(1);
    const second = importReports(first.item, [parseReport(extractOf('2023', 120, 100), 'y2023_extracted.json')], 'Muster Technik GmbH');
    expect(second.item.id).toBe(first.item.id);
    expect(second.item.reports).toHaveLength(2);
    expect(second.item.dataset.periods.map((p) => p.id)).toEqual(['2021', '2022', '2023']);
    const revenue = second.item.dataset.facts.find((f) => f.key === 'revenue')!;
    expect(revenue.values['2022']).toBe(100);
    expect(revenue.values['2023']).toBe(120);
    expect(second.item.name).toBe('Muster Technik GmbH');
  });

  it('replaces the report of a re-uploaded year', () => {
    const first = importReports(null, [parseReport(extractOf('2022', 100, 90), 'y2022_extracted.json')], 'Muster Technik GmbH');
    const again = importReports(first.item, [parseReport(extractOf('2022', 110, 90), 'y2022_extracted.json')], 'Muster Technik GmbH');
    expect(again.item.reports).toHaveLength(1);
    expect(again.item.dataset.facts.find((f) => f.key === 'revenue')!.values['2022']).toBe(110);
  });

  it('merges at value level when the stored source has no reports', () => {
    const target = {
      id: 'legacy',
      name: 'Muster Technik GmbH',
      fileName: 'alt.csv',
      createdAt: new Date().toISOString(),
      dataset: ds({ name: 'Muster Technik GmbH', periods: [own('2022')], facts: [fact('revenue', { '2022': 100 })] }),
    };
    const merged = importReports(target, [parseReport(extractOf('2023', 120, 100), 'y2023_extracted.json')], 'Muster Technik GmbH');
    expect(merged.item.id).toBe('legacy');
    expect(merged.item.reports).toBeUndefined();
    const revenue = merged.item.dataset.facts.find((f) => f.key === 'revenue')!;
    expect(revenue.values['2022']).toBe(100);
    expect(revenue.values['2023']).toBe(120);
  });
});

describe('importDataset', () => {
  it('merges a table upload into the stored source of the same name', () => {
    const target = {
      id: 'src',
      name: 'Muster Technik GmbH',
      fileName: 'y2022_extracted.json',
      createdAt: new Date().toISOString(),
      dataset: report2022,
    };
    const merged = importDataset(
      target,
      ds({ name: 'Muster Technik GmbH', periods: [own('2023')], facts: [fact('headcount', { '2023': 42 })] }),
      'Muster Technik GmbH',
      'personal.csv',
    );
    expect(merged.item.id).toBe('src');
    expect(merged.item.fileName).toBe('y2022_extracted.json, personal.csv');
    expect(merged.item.dataset.facts.find((f) => f.key === 'headcount')!.values['2023']).toBe(42);
    expect(merged.item.dataset.facts.find((f) => f.key === 'revenue')!.values['2022']).toBe(100);
    expect(merged.item.reports).toBeUndefined();
  });
});

describe('matching and file names', () => {
  it('matches stored datasets by normalised display name', () => {
    const stored = [
      { name: 'Technologie-Institut für Metall und Engineering GmbH', dataset: ds({ name: 'andere GmbH', periods: [], facts: [] }) },
      { name: 'ifos Institut', dataset: ds({ name: 'ifos Institut', periods: [], facts: [] }) },
    ];
    expect(matchCandidates(stored, ['Technologieinstitut für Metall und Engineering GmbH'])).toEqual([stored[0]]);
    expect(matchCandidates(stored, ['unbekannt'])).toEqual([]);
  });

  it('reads the file names of a stored item', () => {
    const report = parseReport(
      {
        source_url: 'https://example.org/2022.pdf',
        pages: [{ page_number: 1, text: 'Bilanz zum 31.12.2022\nMuster Technik GmbH' }],
      },
      'y2022_extracted.json',
    );
    expect(storedFileNames({ fileName: 'x', reports: [report] })).toEqual(['y2022_extracted.json']);
    expect(storedFileNames({ fileName: 'a.csv, b.csv' })).toEqual(['a.csv', 'b.csv']);
  });
});

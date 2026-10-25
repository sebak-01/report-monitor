import { describe, expect, it } from 'vitest';
import { parseAnlagespiegel, solveRow, findAnlagespiegelPage } from './anlagespiegel';
import { buildDataset, combineReports, parseReport } from './buildDataset';
import { looksLikeExtract, readReportMeta } from './detect';
import { numbersIn, pair } from './numbers';
import { parseStatements } from './statements';

const LAYOUT_IFOS =
  'Anschaffungs-, Zugänge Abgänge Umbuchungen Anschaffungs-, kumulierte Abschreibung Abgänge Umbuchungen kumulierte Buchwert\n' +
  'Herstellungs- Herstellungs- Abschreibung Geschäftsjahr Abschreibung\n' +
  'kosten kosten\n' +
  '01.01.2024 31.12.2024 01.01.2024 31.12.2024 31.12.2024\n' +
  'Euro Euro Euro Euro Euro Euro Euro Euro Euro Euro Euro\n';

describe('numbersIn', () => {
  it('reads German amounts and ignores dates', () => {
    expect(numbersIn('55.110,43 1 679,83')).toEqual([55110.43, 1679.83]);
    expect(numbersIn('01.01.2024 31.12.2024')).toEqual([]);
    expect(numbersIn('969.67')).toEqual([969.67]);
    expect(numbersIn('31,601,88')).toEqual([31601.88]);
    expect(numbersIn('2.Geschäfts- oder Firmenwert 0,00 198.336,00')).toEqual([0, 198336]);
  });
  it('reads amounts with a trailing minus as negative', () => {
    expect(numbersIn('198.336,00- 0,00')).toEqual([-198336, 0]);
    expect(numbersIn('-2.400,00')).toEqual([-2400]);
    expect(numbersIn('(631,37)')).toEqual([-631.37]);
  });
  it('parses a pair of years', () => {
    expect(pair([1, 2])).toEqual([1, 2]);
    expect(pair([5, 5, 7])).toEqual([5, 7]);
    expect(pair([5])).toBeNull();
  });
});

describe('detect', () => {
  it('recognises an extract and reads year and company', () => {
    const extract = {
      source_url: 'https://example.org/x.pdf',
      pages: [
        {
          page_number: 1,
          text: 'Bilanz zum 31.12.2024\nMuster Technik GmbH, Musterstadt\nAKTIVA PASSIVA',
        },
      ],
    };
    expect(looksLikeExtract(extract)).toBe(true);
    expect(looksLikeExtract({ schemaVersion: '0.3' })).toBe(false);
    const meta = readReportMeta(extract, 'x_extracted.json');
    expect(meta.periodId).toBe('2024');
    expect(meta.entityName).toBe('Muster Technik GmbH');
    expect(meta.entitySeat).toBe('Musterstadt');
    expect(meta.extraction).toBe('text-layer');
  });
});

describe('anlagespiegel', () => {
  it('solves a row with omitted zero cells', () => {
    const roles: string[] = [
      'cost-start', 'additions', 'disposals', 'transfers', 'cost-end',
      'accdep-start', 'dep-expense', 'dep-disposals', 'dep-transfers', 'accdep-end',
      'book-value',
    ];
    const layout = {
      roles: roles as never,
      groups: Array.from({ length: 11 }, () => undefined),
      labels: Array.from({ length: 11 }, (_, i) => `c${i}`),
    };
    const keys = [...roles];
    // Printed as: AHK 01.01, AHK 31.12, AfA 01.01, AfA 31.12, Buchwert (zeros omitted).
    const solved = solveRow([55110.43, 55110.43, 55094.43, 55094.43, 16], layout, keys);
    expect(solved).not.toBeNull();
    expect(solved!['cost-start']).toBe(55110.43);
    expect(solved!['cost-end']).toBe(55110.43);
    expect(solved!['accdep-start']).toBe(55094.43);
    expect(solved!['book-value']).toBe(16);
    expect(solved!['additions']).toBe(0);
  });

  it('parses a schedule page into rows and columns', () => {
    const text =
      LAYOUT_IFOS +
      'A.Anlagevermögen\n' +
      'I.Immaterielle Vermögensgegenstände\n' +
      '1.entgeltlich erworbene Konzessionen, gewerbliche 55.110,43 55.110,43 55.094,43 55.094,43 16,00\n' +
      'Summe Immaterielle Vermögensgegenstände 55.110,43 0,00 55.110,43 55.094,43 0,00 55.094,43 16,00\n';
    const { schedule, warnings } = parseAnlagespiegel(text, '2024', 6);
    expect(warnings).toEqual([]);
    expect(schedule).not.toBeNull();
    expect(schedule!.columns).toHaveLength(11);
    expect(schedule!.columns[0].role).toBe('cost-start');
    const item = schedule!.rows.find((r) => /entgeltlich/.test(r.labelDe));
    expect(item).toBeDefined();
    expect(item!.values['2024']!['book-value']).toBe(16);
    const total = schedule!.rows.find((r) => /^Summe Immaterielle/.test(r.labelDe));
    expect(total!.emphasis).toBe('total');
  });

  it('finds the schedule page and not the Anhang mention', () => {
    const pages = [
      { page_number: 3, text: 'Die Abschreibungen ergeben sich aus dem Anlagespiegel.' },
      { page_number: 6, text: 'ANLAGENSPIEGEL zum 31.12.2024\n' + LAYOUT_IFOS + 'Summe Anlagevermögen 1 2 3 4 5 6 7 8 9 10 11' },
    ];
    expect(findAnlagespiegelPage(pages)!.page_number).toBe(6);
    expect(findAnlagespiegelPage([{ page_number: 3, text: 'Anlagespiegel siehe oben' }])).toBeNull();
  });
});

describe('statements', () => {
  it('reads figures of a two-column balance sheet', () => {
    const pages = [
      {
        page_number: 1,
        text:
          'AKTIVA PASSIVA\n' +
          'A. Anlagevermögen A. Eigenkapital\n' +
          'I. Immaterielle Vermögensgegenstände I. Gezeichnetes Kapital 900.000,00 900.000,00\n' +
          '1. entgeltlich erworbene Konzessionen, gewerb- II. Kapitalrücklage 643.217,77 567.441,46\n' +
          'liche Schutzrechte und ähnliche Rechte und\n' +
          'Werte sowie Lizenzen an solchen Rechten und\n' +
          'Werten 16,00 16,00\n' +
          '2. Geschäfts- oder Firmenwert 158.669,00 0,00 Summe Eigenkapital 855.803,66 871.374,97\n' +
          '3. geleistete Anzahlungen 0,00 198.336,00\n' +
          '158.685,00 198.352,00 B. andere Sonderposten 2.652.677,89 2.774.707,95\n' +
          'II. Sachanlagen C. Rückstellungen\n' +
          '1. Grundstücke, grundstücksgleiche Rechte und 1. sonstige Rückstellungen 53.030,00 145.550,00\n' +
          'Bauten einschließlich der Bauten auf fremden\n' +
          'Grundstücken 1.938.108,82 2.054.386,82\n' +
          '2. andere Anlagen, Betriebs- und Geschäftsausstattung 548.546,00 124.303,00\n' +
          '3. geleistete Anzahlungen und Anlagen im Bau 0,00 281.664,00\n' +
          '2.486.654,82 2.460.353,82 D. Verbindlichkeiten\n' +
          'Summe Anlagevermögen 2.645.339,82 2.658.705,82\n' +
          '1. Verbindlichkeiten aus Lieferungen und Leistungen 147.010,46 26.169,53\n' +
          '2. sonstige Verbindlichkeiten 3.988,39 6.252,23\n' +
          'Summe Verbindlichkeiten 150.998,85 32.421,76\n' +
          'B. Umlaufvermögen\n' +
          'I. Vorräte 150.998,85 32.421,76\n' +
          '1. Roh-, Hilfs- und Betriebsstoffe 83.884,10 0,00\n' +
          '2. unfertige Erzeugnisse, unfertige Leistungen 0,00 24.800,00\n' +
          'III. Kassenbestand, Bundesbankguthaben 406.581,88 510.256,64\n' +
          'Summe Umlaufvermögen 1.062.649,32 1.160.877,90\n' +
          'C. Rechnungsabgrenzungsposten 4.521,26 4.470,96\n' +
          '3.712.510,40 3.824.054,68 3.712.510,40 3.824.054,68\n',
      },
    ];
    const { facts } = parseStatements(pages, '2024', '2023');
    const value = (key: string) => facts.find((f) => f.key === key)?.values['2024'];
    expect(value('subscribed_capital')).toBe(900000);
    expect(value('capital_reserve')).toBe(643217.77);
    expect(value('goodwill')).toBe(158669);
    expect(value('total_assets')).toBe(3712510.4);
    expect(value('total_equity_and_liabilities')).toBe(3712510.4);
    expect(value('fixed_assets_total')).toBe(2645339.82);
    expect(value('cash')).toBe(406581.88);
    expect(value('trade_payables')).toBe(147010.46);
  });
});

describe('buildDataset', () => {
  const de = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const extractOf = (year: string, revenue: number, priorRevenue: number, book: number) => {
    const bookPrior = Math.round(book * 1.1);
    return {
      source_url: `https://example.org/${year}.pdf`,
      pages: [
        {
          page_number: 1,
          text:
            `Bilanz zum 31.12.${year}\nMuster Technik GmbH, Musterstadt\nAKTIVA PASSIVA\n` +
            `1. Umsatzerlöse ${de(revenue)} ${de(priorRevenue)}\n` +
            `Summe Anlagevermögen ${de(book)} ${de(bookPrior)}\n` +
            `${de(book)} ${de(bookPrior)} ${de(book)} ${de(bookPrior)}\n`,
        },
        {
          page_number: 2,
          text:
            `ANLAGENSPIEGEL zum 31.12.${year}\n` +
            LAYOUT_IFOS +
            'A.Anlagevermögen\n' +
            `1.entgeltlich erworbene Konzessionen, gewerbliche ${de(book)} ${de(bookPrior)} ${de(book)} ${de(bookPrior)} ${de(Math.round(book * 0.1))}\n` +
            `Summe Anlagevermögen ${de(book)} ${de(bookPrior)} ${de(book)} ${de(bookPrior)} ${de(Math.round(book * 0.1))}\n`,
        },
      ],
    };
  };

  it('merges several report years into one dataset', () => {
    const a = parseReport(extractOf('2024', 100, 90, 500), 'y2024_extracted.json');
    const b = parseReport(extractOf('2023', 90, 80, 550), 'y2023_extracted.json');
    const { dataset, warnings } = buildDataset([a, b]);
    expect(warnings).toEqual([]);
    expect(dataset.schemaVersion).toBe('0.4');
    expect(dataset.periods.map((p) => p.id)).toEqual(['2022', '2023', '2024']);
    expect(dataset.periods[0].comparisonOnly).toBe(true);
    expect(dataset.views.map((v) => v.id)).toContain('anlagespiegel');
    expect(dataset.schedules?.[0].rows.length).toBeGreaterThan(0);
    const revenue = dataset.facts.find((f) => f.key === 'revenue');
    expect(revenue!.values['2024']).toBe(100);
    expect(revenue!.values['2023']).toBe(90);
    expect(dataset.sources).toHaveLength(2);
  });

  it('reports differing figures for the same year', () => {
    const a = parseReport(extractOf('2024', 100, 90, 500), 'y2024_extracted.json');
    const b = parseReport(extractOf('2023', 95, 80, 550), 'y2023_extracted.json');
    const { dataset, warnings } = buildDataset([a, b]);
    const revenue = dataset.facts.find((f) => f.key === 'revenue');
    // The report of the year itself is the reference for that year.
    expect(revenue!.values['2023']).toBe(95);
    expect(warnings.join(' ')).toMatch(/Abweichung|weicht ab/);
  });

  it('merges reports uploaded one after another like a single drop', () => {
    const a = parseReport(extractOf('2024', 100, 90, 500), 'y2024_extracted.json');
    const b = parseReport(extractOf('2023', 90, 80, 550), 'y2023_extracted.json');
    // First the 2023 report alone, later the 2024 one on top of it.
    const merged = buildDataset(combineReports([b], [a]));
    const atOnce = buildDataset([b, a]);
    expect(merged.dataset.periods.map((p) => p.id)).toEqual(atOnce.dataset.periods.map((p) => p.id));
    const values = (ds: typeof merged.dataset) => ds.facts.find((f) => f.key === 'revenue')!.values;
    expect(values(merged.dataset)).toEqual(values(atOnce.dataset));
    expect(merged.dataset.sources.map((s) => s.period)).toEqual(atOnce.dataset.sources.map((s) => s.period));
  });

  it('replaces the stored report when the same year is uploaded again', () => {
    const old = parseReport(extractOf('2024', 100, 90, 500), 'y2024_extracted.json');
    const fresh = parseReport(extractOf('2024', 120, 90, 500), 'y2024_extracted.json');
    const b = parseReport(extractOf('2023', 90, 80, 550), 'y2023_extracted.json');
    expect(combineReports([b, old], [fresh])).toEqual([b, fresh]);
    const { dataset } = buildDataset(combineReports([b, old], [fresh]));
    const revenue = dataset.facts.find((f) => f.key === 'revenue')!;
    expect(revenue.values['2024']).toBe(120);
  });
});

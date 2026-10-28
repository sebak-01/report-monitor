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
    expect(pair([1, 2, 2])).toEqual([1, 2]);
    expect(pair([5])).toBeNull();
    // "b) 105.580,68 180.210,51 107.148,38" – the middle amount is the merged
    // group total printed on the item's row, the last one is the prior year.
    expect(pair([105580.68, 180210.51, 107148.38])).toEqual([105580.68, 107148.38]);
  });

  it('splits amounts the OCR glued together and reads lone closing parens', () => {
    expect(numbersIn('109.198,00.125.979,00')).toEqual([109198, 125979]);
    expect(numbersIn('83.594.61.864,64 864.64')).toEqual([83594.61, 864.64, 864.64]);
    expect(numbersIn('11,174.11.171.441,74')).toEqual([11174.11, 171441.74]);
    expect(numbersIn('(Vorjahr EUR 48.419,51) 2.580.094,56')).toEqual([48419.51, 2580094.56]);
    // Dot decimals must not swallow the amount that follows.
    expect(numbersIn('16.00 16,00')).toEqual([16, 16]);
    expect(numbersIn('70.544.48 83.638,09')).toEqual([70544.48, 83638.09]);
    expect(numbersIn('969.67 1.234,56')).toEqual([969.67, 1234.56]);
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

  it('keeps a wrapped company name with its first line', () => {
    const extract = {
      pages: [
        {
          page_number: 1,
          text:
            'Forschungsinstitut für Anorganische Werkstoffe\n' +
            '-Glas/Keramik- GmbH, Höhr-Grenzhausen\n' +
            'Bilanz zum 31.12.2019',
        },
      ],
    };
    const meta = readReportMeta(extract, 'fgk-2019_extracted.json');
    expect(meta.entityName).toBe('Forschungsinstitut für Anorganische Werkstoffe -Glas/Keramik- GmbH');
    expect(meta.entitySeat).toBe('Höhr-Grenzhausen');
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

  it('leaves a side-by-side label empty instead of borrowing another row\'s amounts', () => {
    const pages = [
      {
        page_number: 1,
        text:
          'BILANZ zum 31.12.2023\nMuster Technik GmbH, Musterstadt\nAKTIVA PASSIVA\n' +
          'I. Immaterielle Vermögensgegenstände I. Gezeichnetes Kapital\n' +
          'Entgeltlich erworbene Konzessionen, gewerbliche Schutzrechte und ähnliche Il. Kapitalrücklage\n' +
          'Rechte und Werte sowie Lizenzen an solchen Rechten und Werten 94.375,00 109.198,00\n' +
          'Die Kapitalrücklage entwickelte sich im Geschäftsjahr 2023 wie folgt:\n' +
          'Anfangsbestand 3.086.180,33 3.230.180,33\n',
      },
    ];
    const { facts, warnings } = parseStatements(pages, '2023', '2022');
    const value = (key: string) => facts.find((f) => f.key === key)?.values['2023'];
    expect(value('intangible_assets')).toBe(94375);
    // The Passiva labels sit in the right column without amounts of their own –
    // the amounts of the Lizenzen row and the roll-forward table are not theirs.
    expect(value('subscribed_capital')).toBeUndefined();
    expect(value('capital_reserve')).toBeUndefined();
    expect(warnings.join(' ')).toMatch(/nicht zuordenbar/);
  });

  it('reads a label that wraps over two lines', () => {
    const pages = [
      {
        page_number: 1,
        text:
          'AKTIVA\n' +
          '1. Grundstücke, grundstücksgleiche Rechte und Bauten einschließlich der Bauten\n' +
          'auf fremden Grundstücken 5.845.890,22 6.002.308,22\n',
      },
    ];
    const { facts } = parseStatements(pages, '2023', '2022');
    expect(facts.find((f) => f.key === 'land_buildings')?.values['2023']).toBe(5845890.22);
  });

  it('reads a page whose side header the OCR garbled into digits', () => {
    const pages = [
      {
        page_number: 1,
        text:
          'A k 11 v s e 11 e\nBilanz zum 31. Dezember 2020\nEUR EUR EUR EUR\n' +
          'A. Anlagevermögen\n' +
          'I. Immaterielle Vermögensgegenstände 174.890,00 205.716,00\n' +
          '9.526.628,39 8.668.376,65\n',
      },
    ];
    const { facts } = parseStatements(pages, '2020', '2019');
    const value = (key: string) => facts.find((f) => f.key === key)?.values['2020'];
    expect(value('intangible_assets')).toBe(174890);
    expect(value('total_assets')).toBe(9526628.39);
    expect(facts.find((f) => f.key === 'intangible_assets')?.values['2019']).toBe(205716);
  });

  it('keeps a wrapped label’s amounts when the other column’s row number lost its dot', () => {
    const pages = [
      {
        page_number: 1,
        text:
          'BILANZ zum 31.12.2023\nAKTIVA PASSIVA\n' +
          '1 Grundstücke, grundstucksgleiche Rechte und\n' +
          'Bauten einschließlich der Bauten auf fremden 1 sonstige Rückstellungen 145.550,00 51.010,00\n' +
          'Grundstücken 2.054.386,82 2.171.308,82\n',
      },
    ];
    const { facts, warnings } = parseStatements(pages, '2023', '2022');
    const value = (key: string) => facts.find((f) => f.key === key)?.values['2023'];
    expect(value('land_buildings')).toBe(2054386.82);
    expect(value('other_provisions')).toBe(145550);
    expect(warnings.join(' ')).not.toMatch(/Gleicher Betrag/);
  });

  it('takes first and last amount of a row whose middle amount is the merged group total', () => {
    const pages = [
      {
        page_number: 1,
        text:
          'Gewinn- und Verlustrechnung für das Geschäftsjahr 2021\n2020\nEUR EUR EUR\n' +
          '3. Materialaufwand\n' +
          'a) Aufwendungen für Roh-, Hilfs- und\n' +
          'Betriebsstoffe und für bezogene Waren 92.369,79 74.629,83\n' +
          'b) Aufwendungen für bezogene Leistungen 133.086,30 225.456,09 105.580,68\n',
      },
    ];
    const { facts } = parseStatements(pages, '2021', '2020');
    const value = (key: string) => facts.find((f) => f.key === key)?.values['2021'];
    const prior = (key: string) => facts.find((f) => f.key === key)?.values['2020'];
    expect(value('material_raw_supplies')).toBe(92369.79);
    expect(value('material_purchased_services')).toBe(133086.3);
    expect(prior('material_purchased_services')).toBe(105580.68);
  });

  it('ignores a mid-page bare amount line as balance-sheet total', () => {
    const pages = [
      {
        page_number: 1,
        text:
          'P A S S I V A\nBilanz zum 31. Dezember 2022\nEUR EUR\n' +
          'C. RÜCKSTELLUNGEN\n' +
          'Sonstige Rückstellungen 25.343,94 15.525,87\n' +
          '25.343,94 15.525,87\n' +
          'D. VERBINDLICHKEITEN\n' +
          '1. Verbindlichkeiten gegenüber Kreditinstituten 332,43 10.015,38\n' +
          'E. RECHNUNGSABGRENZUNGSPOSTEN 4.383,16 2.439,66\n' +
          'Anlage 1 Seite 2\n',
      },
    ];
    const { facts } = parseStatements(pages, '2022', '2021');
    const value = (key: string) => facts.find((f) => f.key === key)?.values['2022'];
    expect(value('other_provisions')).toBe(25343.94);
    expect(value('total_equity_and_liabilities')).toBeUndefined();
  });

  it('sums a group total from items that are only found later', () => {
    // No "Summe Anlagevermögen" printed: it must become intangible + tangible,
    // even when the tangible total is itself a sum of items found afterwards.
    const pages = [
      {
        page_number: 1,
        text:
          'AKTIVA\n' +
          'I. Immaterielle Vermögensgegenstände 94.375,00 109.198,00\n' +
          'II. Sachanlagen\n' +
          '1. Grundstücke, grundstücksgleiche Rechte und Bauten einschließlich der Bauten auf fremden Grundstücken 5.845.890,22 6.002.308,22\n' +
          '2. Technische Anlagen und Maschinen 2.279.073,33 1.408.290,78\n',
      },
    ];
    const { facts } = parseStatements(pages, '2023', '2022');
    const value = (key: string) => facts.find((f) => f.key === key)?.values['2023'];
    expect(value('intangible_assets')).toBe(94375);
    expect(value('tangible_assets_total')).toBeCloseTo(5845890.22 + 2279073.33, 2);
    expect(value('fixed_assets_total')).toBeCloseTo(94375 + 5845890.22 + 2279073.33, 2);
  });

  it('drops an implausible balance-sheet total', () => {
    const pages = [{ page_number: 1, text: 'AKTIVA\n-1.345.583,90 -1.000.000,00\n' }];
    const { facts, warnings } = parseStatements(pages, '2023', '2022');
    expect(facts.find((f) => f.key === 'total_assets')).toBeUndefined();
    expect(warnings.join(' ')).toMatch(/Bilanzsumme.*unplausibel/);
  });

  it('warns when one amount is read for several figures', () => {
    const pages = [
      {
        page_number: 1,
        text:
          'AKTIVA\n' +
          'I. Vorräte 100,00 50,00\n' +
          'II. Forderungen und sonstige Vermögensgegenstände 100,00 50,00\n' +
          'III. Kassenbestand, Bundesbankguthaben 100,00 50,00\n',
      },
    ];
    const { warnings } = parseStatements(pages, '2023', '2022');
    expect(warnings.join(' ')).toMatch(/Gleicher Betrag/);
  });

  it('reads both columns of a layout-padded balance sheet', () => {
    // The extraction keeps x-positions: wide padding separates Aktiva and
    // Passiva, each column with its own label and amounts.
    const pages = [
      {
        page_number: 1,
        text:
          'BILANZ zum 31. Dezember 2023\nMuster Technik GmbH, Musterstadt\n' +
          'AKTIVA                                                                                                          PASSIVA\n' +
          'A. Anlagevermögen                                                                                               A. Eigenkapital\n' +
          'I. Immaterielle Vermögensgegenstände                                                                            l. Gezeichnetes Kapital       900.000,00     900.000,00\n' +
          'Entgeltlich erworbene Konzessionen, gewerbliche Schutzrechte und ähnliche                                       Il. Kapitalrücklage         643.217,77     567.441,46\n' +
          'Rechte und Werte sowie Lizenzen an solchen Rechten und Werten       16,00       16,00\n' +
          'Il. Sachanlagen\n' +
          '1. Grundstücke, grundstücksgleiche Rechte und Bauten einschließlich der Bauten\n' +
          'auf fremden Grundstücken                                        5.845.890,22     6.002.308,22        C. Rückstellungen\n' +
          '2. Technische Anlagen und Maschinen                             2.279.073,33     1.408.290,78\n' +
          '3. Andere Anlagen, Betriebs- und Geschäftsausstattung             568.810,51       651.993,30        Sonstige Rückstellungen     239.218,34     223.854,40\n' +
          '4. Geleistete Anzahlungen und Anlagen im Bau                          0,00       115.000,00\n' +
          '8.693.774,06     8.177.592,30        D. Verbindlichkeiten\n' +
          '1. Roh-, Hilfs- und Betriebsstoffe                               64.428,14       64.904,55            423.220,51     343.152,03\n' +
          '10.454.082,46   10.009.169,39                             10.454.082,46   10.009.169,39\n',
      },
    ];
    const { facts, warnings } = parseStatements(pages, '2023', '2022');
    const value = (key: string) => facts.find((f) => f.key === key)?.values['2023'];
    // Passiva: the right column's amounts stay with their own labels.
    expect(value('subscribed_capital')).toBe(900000);
    expect(value('capital_reserve')).toBe(643217.77);
    expect(value('other_provisions')).toBe(239218.34);
    // Aktiva: wrapped labels and rows whose amounts end beside another label.
    expect(value('intangible_licenses')).toBe(16);
    expect(value('land_buildings')).toBe(5845890.22);
    expect(value('technical_equipment')).toBe(2279073.33);
    expect(value('other_equipment')).toBe(568810.51);
    expect(value('raw_materials')).toBe(64428.14);
    expect(value('tangible_assets_total')).toBeCloseTo(8693774.06, 2);
    expect(value('fixed_assets_total')).toBeCloseTo(8693774.06 + 16, 2);
    expect(value('total_assets')).toBe(10454082.46);
    expect(value('total_equity_and_liabilities')).toBe(10454082.46);
    expect(warnings.join(' ')).not.toMatch(/erwartet werden zwei/);
  });

  it('reads OCR-quirky labels: split letters and dropped umlauts', () => {
    const pages = [
      {
        page_number: 1,
        text:
          'Bilanz zum 31.12.2024\nMuster Technik GmbH\nAKTIVA PASSIVA\n' +
          'I. Immaterielle Vermögensgegenstände I. Gezeichnetes Kapital 900.000,00 900.000,00\n' +
          'entgeltlich erworbene Konzessionen, gewerbliche I I . K a p italrücklage 3.354.285,57 3.230.180,33\n' +
          'Schutzrechte und ähnliche Rechte und Werte\n' +
          'sowie Lizenzen an solchen Rechten und Werten 82.708,00 94.375,00 III. Jahresfehlbetrag -2.051.823,81 -2.180.384,72\n',
      },
    ];
    const { facts } = parseStatements(pages, '2024', '2023');
    const value = (key: string) => facts.find((f) => f.key === key)?.values['2024'];
    // "K a p italrücklage" glues back to the label; its amounts stay its own.
    expect(value('capital_reserve')).toBe(3354285.57);
    expect(value('intangible_licenses')).toBe(82708);
    expect(value('net_result_balance')).toBe(-2051823.81);
  });

  it('reads labels whose umlauts the OCR dropped', () => {
    const pages = [
      {
        page_number: 1,
        text: 'Aktivseite\nI Immaterielle Vermogensgegenstande 109.198,00 125 979,00\n',
      },
    ];
    const { facts } = parseStatements(pages, '2023', '2022');
    expect(facts.find((f) => f.key === 'intangible_assets')?.values['2023']).toBe(109198);
  });

  it('ignores GuV roll-forward rows when reading the balance sheet', () => {
    const pages = [
      {
        page_number: 1,
        text:
          'Aktivseite\n1. Stammkapital 1 370 000,00 1 370 000,00\n' +
          'II Kaoitalrucklaae 3 086 180,33 2 550 037,22\n' +
          'III. Bilanzverlust -1 868 250,46 -922 730,85\n',
      },
      {
        page_number: 2,
        text: 'Gewinn- und Verlustrechnung\n13. Entnahmen aus der Kapitalrücklage 922.730,85 1 323 315,57\n14. Bilanzverlust -1 868 250,46 -922 730,85\n',
      },
    ];
    const { facts } = parseStatements(pages, '2022', '2021');
    const value = (key: string) => facts.find((f) => f.key === key)?.values['2022'];
    // The Passivseite row wins over the GuV's "Entnahmen aus der Kapitalrücklage".
    expect(value('capital_reserve')).toBe(3086180.33);
    expect(value('subscribed_capital')).toBe(1370000);
    expect(value('equity_total')).toBeCloseTo(1370000 + 3086180.33 - 1868250.46, 2);
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

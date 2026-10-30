import { describe, expect, it } from 'vitest';
import { BALANCE_LAYOUT } from './balanceLayout';
import { buildBalanceStatementRows, buildStatementRows } from './statementRows';
import type { Dataset, Fact } from '../types';

function datasetWith(facts: Fact[]): Dataset {
  return {
    schemaVersion: '0.4',
    entity: { id: 'test', name: 'Test GmbH' },
    sources: [],
    periods: [
      { id: '2023', start: '2023-01-01', end: '2023-12-31' },
      { id: '2024', start: '2024-01-01', end: '2024-12-31' },
    ],
    conventions: { currency: 'EUR' },
    statements: {
      balance_assets: { labelDe: 'Aktiva' },
      balance_liabilities: { labelDe: 'Passiva' },
      income: { labelDe: 'Gewinn- und Verlustrechnung' },
    },
    views: [],
    facts,
    derivedKpis: [],
    checks: [],
  };
}

function fact(key: string, statement: string, values: Record<string, number | null>, rest: Partial<Fact> = {}): Fact {
  return {
    key,
    statement,
    labelDe: key,
    unit: 'EUR',
    values,
    ...rest,
  };
}

describe('statement rows: tree order', () => {
  it('puts parents above their children, even when the dataset lists them later', () => {
    // The generated datasets print the group total after its items.
    const rows = buildStatementRows(
      datasetWith([
        fact('advance', 'income', { '2024': 1 }, { labelDe: 'Erhaltene Anzahlungen', parentKey: 'liabilities' }),
        fact('trade', 'income', { '2024': 2 }, { labelDe: 'Lieferungen und Leistungen', parentKey: 'liabilities' }),
        fact('liabilities', 'income', { '2024': 3 }, { labelDe: 'Summe Verbindlichkeiten' }),
      ]),
      'income',
      '2024',
      '2023',
    );
    expect(rows.map((r) => r.key)).toEqual(['liabilities', 'advance', 'trade']);
  });

  it('keeps the dataset order among siblings and nests grandchildren below their parent', () => {
    const rows = buildStatementRows(
      datasetWith([
        fact('item', 'income', { '2024': 1 }, { parentKey: 'group' }),
        fact('memo', 'income', { '2024': 2 }, { parentKey: 'item' }),
        fact('group', 'income', { '2024': 3 }),
        fact('other', 'income', { '2024': 4 }),
      ]),
      'income',
      '2024',
      '2023',
    );
    expect(rows.map((r) => r.key)).toEqual(['group', 'item', 'memo', 'other']);
  });
});

describe('balance rows: § 266 HGB skeleton', () => {
  it('orders the Passiva A/B/C/D/E/F with Sonderposten as B', () => {
    const rows = buildBalanceStatementRows(datasetWith([]), 'balance_liabilities', '2024', '2023');
    const top = rows.filter((r) => r.level === 0).map((r) => `${r.number} ${r.label}`);
    expect(top).toEqual([
      'A. Eigenkapital',
      'B. Sonderposten',
      'C. Rückstellungen',
      'D. Verbindlichkeiten',
      'E. Rechnungsabgrenzungsposten',
      'F. Passive latente Steuern',
      ' Bilanzsumme',
    ]);
  });

  it('shows the full § 266 catalogue in order, empty posts included', () => {
    const rows = buildBalanceStatementRows(datasetWith([]), 'balance_assets', '2024', '2023');
    expect(rows.map((r) => r.key)).toEqual(BALANCE_LAYOUT.balance_assets.map((s) => s.key));
    // The empty "Wertpapiere" post keeps the numbering of the law before the cash line.
    const securities = rows.find((r) => r.key === 'securities_current_total')!;
    const cash = rows.find((r) => r.key === 'cash')!;
    expect(securities.number).toBe('III.');
    expect(cash.number).toBe('IV.');
    expect(rows.indexOf(securities)).toBeLessThan(rows.indexOf(cash));
    expect(securities.current).toBeNull();
  });

  it('numbers the posts per § 266, not as the report prints them', () => {
    const rows = buildBalanceStatementRows(
      datasetWith([fact('cash', 'balance_assets', { '2024': 100 }, { numberLabel: 'III.' })]),
      'balance_assets',
      '2024',
      '2023',
    );
    const cash = rows.find((r) => r.key === 'cash')!;
    expect(cash.number).toBe('IV.');
    expect(cash.label).toBe('Kassenbestand, Bundesbankguthaben, Guthaben bei Kreditinstituten und Schecks');
    expect(cash.current).toBe(100);
  });
});

describe('balance rows: mapping the data', () => {
  it('uses "B. Sonderposten" as the standard term for both report wordings', () => {
    for (const labelDe of ['Sonderposten für Investitionszuschüsse zum Anlagevermögen', 'Sonderposten für Investitionszuschüsse']) {
      const rows = buildBalanceStatementRows(
        datasetWith([
          fact('special_item_grants', 'balance_liabilities', { '2024': 500 }, { labelDe, numberLabel: 'B.' }),
        ]),
        'balance_liabilities',
        '2024',
        '2023',
      );
      const row = rows.find((r) => r.key === 'special_item_grants')!;
      expect(row.label).toBe('Sonderposten');
      expect(row.number).toBe('B.');
      expect(row.current).toBe(500);
      expect(row.note).toContain(labelDe);
    }
  });

  it('sums the report positions that § 266 folds into "sonstige"', () => {
    const rows = buildBalanceStatementRows(
      datasetWith([
        fact('other_assets', 'balance_assets', { '2024': 10 }, { labelDe: 'Sonstige Vermögensgegenstände' }),
        fact('grantor_receivables', 'balance_assets', { '2024': 5 }, { labelDe: 'Forderungen an Zuschussgeber' }),
        fact('shareholder_receivables', 'balance_assets', { '2024': 2 }, { labelDe: 'Forderungen gegen Gesellschafter' }),
        fact('other_liabilities', 'balance_liabilities', { '2024': 7 }, { labelDe: 'Sonstige Verbindlichkeiten' }),
        fact('unused_grants_liabilities', 'balance_liabilities', { '2024': 3 }, {
          labelDe: 'Verbindlichkeiten aus noch nicht verwendeten Zuschüssen',
        }),
        fact('shareholder_liabilities', 'balance_liabilities', { '2024': 4 }, {
          labelDe: 'Verbindlichkeiten gegenüber Gesellschaftern',
        }),
      ]),
      'balance_assets',
      '2024',
      '2023',
    );
    const otherAssets = rows.find((r) => r.key === 'other_assets')!;
    expect(otherAssets.label).toBe('Sonstige Vermögensgegenstände');
    expect(otherAssets.current).toBe(17);
    expect(rows.some((r) => r.key === 'grantor_receivables')).toBe(false);
    expect(otherAssets.note).toContain('Forderungen an Zuschussgeber');

    const liabs = buildBalanceStatementRows(
      datasetWith([
        fact('other_liabilities', 'balance_liabilities', { '2024': 7 }),
        fact('unused_grants_liabilities', 'balance_liabilities', { '2024': 3 }),
        fact('shareholder_liabilities', 'balance_liabilities', { '2024': 4 }),
      ]),
      'balance_liabilities',
      '2024',
      '2023',
    );
    expect(liabs.find((r) => r.key === 'other_liabilities')!.current).toBe(14);
  });

  it('leaves posts empty that the reports do not show – a stored 0 of an absent line counts as nothing', () => {
    const rows = buildBalanceStatementRows(
      datasetWith([
        fact('tax_provisions', 'balance_liabilities', { '2024': 0, '2023': 5600 }, { absentIn: ['2024'] }),
      ]),
      'balance_liabilities',
      '2024',
      '2023',
    );
    const row = rows.find((r) => r.key === 'tax_provisions')!;
    expect(row.number).toBe('2.');
    expect(row.label).toBe('Steuerrückstellungen');
    expect(row.current).toBeNull();
    expect(row.previous).toBeNull();
    expect(row.deltaAbs).toBeNull();
  });

  it('computes the change from the summed printed values', () => {
    const rows = buildBalanceStatementRows(
      datasetWith([
        fact('other_assets', 'balance_assets', { '2024': 12, '2023': 10 }, { printSign: 1 }),
        fact('grantor_receivables', 'balance_assets', { '2024': 3, '2023': 5 }),
      ]),
      'balance_assets',
      '2024',
      '2023',
    );
    const row = rows.find((r) => r.key === 'other_assets')!;
    expect(row.current).toBe(15);
    expect(row.previous).toBe(15);
    expect(row.deltaAbs).toBe(0);
  });

  it('keeps facts without a § 266 row visible below their group', () => {
    const rows = buildBalanceStatementRows(
      datasetWith([
        fact('liabilities_total', 'balance_liabilities', { '2024': 10 }),
        fact('exotic', 'balance_liabilities', { '2024': 4 }, { labelDe: 'Exotische Verbindlichkeit', parentKey: 'liabilities_total' }),
        fact('total_equity_and_liabilities', 'balance_liabilities', { '2024': 10 }),
      ]),
      'balance_liabilities',
      '2024',
      '2023',
    );
    const keys = rows.map((r) => r.key);
    expect(keys).toContain('exotic');
    // Inside the D. subtree (before E.), one level below the group row.
    expect(keys.indexOf('exotic')).toBeGreaterThan(keys.indexOf('liabilities_total'));
    expect(keys.indexOf('exotic')).toBeLessThan(keys.indexOf('deferred_income'));
    const exotic = rows.find((r) => r.key === 'exotic')!;
    expect(exotic.level).toBe(1);
    expect(exotic.ancestors).toEqual(['liabilities_total']);
    expect(exotic.current).toBe(4);
  });
});

describe('balance rows: only rows with data (includeEmptyRows: false)', () => {
  it('drops posts without figures and keeps those with data – a printed 0 counts as data', () => {
    const rows = buildBalanceStatementRows(
      datasetWith([
        fact('cash', 'balance_assets', { '2024': 100 }),
        fact('trade_receivables', 'balance_assets', { '2024': 50 }),
        fact('raw_materials', 'balance_assets', { '2024': 0 }),
      ]),
      'balance_assets',
      '2024',
      '2023',
      { includeEmptyRows: false },
    );
    expect(rows.map((r) => r.key)).toEqual([
      'current_assets_total',
      'inventories_total',
      'raw_materials',
      'receivables_total',
      'trade_receivables',
      'cash',
    ]);
  });

  it('keeps parents while one of their children shows a figure', () => {
    const rows = buildBalanceStatementRows(
      datasetWith([fact('other_liabilities_taxes', 'balance_liabilities', { '2024': 5 })]),
      'balance_liabilities',
      '2024',
      '2023',
      { includeEmptyRows: false },
    );
    expect(rows.map((r) => r.key)).toEqual(['liabilities_total', 'other_liabilities', 'other_liabilities_taxes']);
    expect(rows.find((r) => r.key === 'other_liabilities')!.current).toBeNull();
  });

  it('keeps a post that only the previous year shows', () => {
    const rows = buildBalanceStatementRows(
      datasetWith([fact('tax_provisions', 'balance_liabilities', { '2023': 5600 })]),
      'balance_liabilities',
      '2024',
      '2023',
      { includeEmptyRows: false },
    );
    const row = rows.find((r) => r.key === 'tax_provisions')!;
    expect(row.current).toBeNull();
    expect(row.previous).toBe(5600);
  });
});

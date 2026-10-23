import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateDataset } from '../validate';
import { parseCsv, detectDelimiter } from './csv';
import { buildUploadDataset, extractPeriodId, guessMapping, slugify, type RawTable } from './mapping';
import { detectNumberFormat, parseNumber } from './numbers';
import { readUpload, UploadError } from './readFile';
import { withGenericView } from './renderable';

const fixture = (name: string) => new URL(`./__fixtures__/${name}`, import.meta.url);
const fileOf = (name: string, content: BlobPart) => new File([content], name);

describe('parseNumber', () => {
  it('reads German and English notation', () => {
    expect(parseNumber('1.234.567,89', 'de')).toBe(1234567.89);
    expect(parseNumber('1,234,567.89', 'en')).toBe(1234567.89);
    expect(parseNumber('1.234', 'de')).toBe(1234);
    expect(parseNumber('1.234', 'en')).toBe(1.234);
  });
  it('handles signs, brackets, currency and spaces', () => {
    expect(parseNumber('-1.000,50 €', 'de')).toBe(-1000.5);
    expect(parseNumber('(2.500,00)', 'de')).toBe(-2500);
    expect(parseNumber('1.000,00-', 'de')).toBe(-1000);
    expect(parseNumber('−7', 'de')).toBe(-7);
    expect(parseNumber('12 345,6', 'de')).toBe(12345.6);
    expect(parseNumber('12,5 %', 'de')).toBe(12.5);
  });
  it('tells empty cells from text', () => {
    expect(parseNumber('', 'de')).toBeNull();
    expect(parseNumber('–', 'de')).toBeNull();
    expect(parseNumber('k.A.', 'de')).toBeNull();
    expect(parseNumber(null, 'de')).toBeNull();
    expect(parseNumber('abc', 'de')).toBeUndefined();
    expect(parseNumber('1,2,3', 'en')).toBe(123);
    expect(parseNumber(42, 'de')).toBe(42);
  });
});

describe('detectNumberFormat', () => {
  it('recognises both notations and defaults to German', () => {
    expect(detectNumberFormat(['1.234,56', '2,5'])).toBe('de');
    expect(detectNumberFormat(['1,234.56', '2.5'])).toBe('en');
    expect(detectNumberFormat([100, 200])).toBe('de');
  });
});

describe('parseCsv', () => {
  it('detects the delimiter and handles quotes', () => {
    const text = 'Position;2023;2024\r\n"Umsatz; netto";"1.000,5";2.000\r\n"Zitat ""A""";1;2\r\n';
    expect(detectDelimiter(text)).toBe(';');
    expect(parseCsv(text)).toEqual([
      ['Position', '2023', '2024'],
      ['Umsatz; netto', '1.000,5', '2.000'],
      ['Zitat "A"', '1', '2'],
    ]);
  });
  it('strips the BOM and trailing empty lines', () => {
    expect(parseCsv('﻿a,b\n1,2\n\n\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('mapping', () => {
  const wide: RawTable = {
    name: 't',
    rows: [
      ['Firma X'],
      [],
      ['Bezeichnung', 'GJ 2022', '2023', 'Bemerkung'],
      ['A. Erlöse', null, null, null],
      ['Umsatzerlöse (netto)', '1.000,50', '2.000,00', 'ok'],
      ['Umsatzerlöse (netto)', '5,00', null, null],
      ['Sonstiges', 'n/a', 'xyz', null],
      [null, '1,00', '2,00', null],
    ],
  };

  it('guesses header row, label column, year columns and notation', () => {
    const m = guessMapping(wide);
    expect(m.headerRow).toBe(2);
    expect(m.labelCol).toBe(0);
    expect(m.layout).toBe('wide');
    expect(m.periodCols).toEqual([
      { col: 1, periodId: '2022' },
      { col: 2, periodId: '2023' },
    ]);
    expect(m.numberFormat).toBe('de');
  });

  it('builds a dataset with unique keys, null for blanks and readable warnings', () => {
    const result = buildUploadDataset(wide, guessMapping(wide), { entityName: 'Firma X', title: 'x.csv' });
    expect(result.errors).toEqual([]);
    const ds = result.dataset!;
    expect(ds.periods.map((p) => p.id)).toEqual(['2022', '2023']);
    expect(ds.facts.map((f) => f.key)).toEqual(['umsatzerloese_netto', 'sonstiges']);
    expect(ds.facts[0].values).toEqual({ '2022': 5, '2023': 2000 });
    expect(ds.facts[1].values).toEqual({ '2022': null, '2023': null });
    expect(result.warnings.join(' ')).toMatch(/Überschrift/);
    expect(result.warnings.join(' ')).toMatch(/keinen lesbaren Zahlenwert/);
    expect(result.warnings.join(' ')).toMatch(/keine Bezeichnung/);
    expect(result.warnings.join(' ')).toMatch(/überschrieben/);
    expect(validateDataset(withGenericView(ds, ['balance', 'income'])).ok).toBe(true);
  });

  it('reads the long layout', () => {
    const long: RawTable = {
      name: 't',
      rows: [
        ['Kennzahl', 'Jahr', 'Wert'],
        ['Umsatz', 2023, 10],
        ['Umsatz', 2024, 12],
        ['Kosten', 2024, 7],
      ],
    };
    const m = guessMapping(long);
    expect(m.layout).toBe('long');
    const ds = buildUploadDataset(long, m, { entityName: '', title: 'long.csv' }).dataset!;
    expect(ds.entity.name).toBe('long.csv');
    expect(ds.facts.find((f) => f.key === 'kosten')?.values).toEqual({ '2023': null, '2024': 7 });
  });

  it('reports mapping errors instead of building', () => {
    const base = guessMapping(wide);
    const dup = buildUploadDataset(wide, { ...base, periodCols: [{ col: 1, periodId: '2023' }, { col: 2, periodId: '2023' }] }, { entityName: 'a', title: 'a' });
    expect(dup.dataset).toBeNull();
    expect(dup.errors[0]).toMatch(/mehreren Spalten/);
    const none = buildUploadDataset(wide, { ...base, periodCols: [] }, { entityName: 'a', title: 'a' });
    expect(none.errors[0]).toMatch(/keine Spalte/);
    const bad = buildUploadDataset(wide, { ...base, periodCols: [{ col: 1, periodId: 'abc' }] }, { entityName: 'a', title: 'a' });
    expect(bad.errors[0]).toMatch(/kein Geschäftsjahr/);
  });

  it('helpers', () => {
    expect(extractPeriodId('31.12.2023')).toBe('2023');
    expect(extractPeriodId('Seite 12345')).toBeNull();
    expect(extractPeriodId(2021)).toBe('2021');
    expect(slugify('Größe & Ärger (netto)')).toBe('groesse_aerger_netto');
  });
});

describe('readUpload', () => {
  it('reads a German CSV in Windows-1252', async () => {
    const bytes = Uint8Array.from([...Buffer.from('Position;2023\nUmsatz;1.000,00\nW', 'latin1'), 0xe4, ...Buffer.from('hrung;5', 'latin1')]);
    const result = await readUpload(fileOf('daten.csv', bytes));
    expect(result.kind).toBe('tables');
    if (result.kind === 'tables') expect(result.tables[0].rows[2][0]).toBe('Währung');
  });

  it('reads xlsx sheets and skips empty ones', async () => {
    const result = await readUpload(new File([readFileSync(fixture('sample.xlsx'))], 'sample.xlsx'));
    expect(result.kind).toBe('tables');
    if (result.kind !== 'tables') return;
    expect(result.tables.map((t) => t.name)).toEqual(['GuV']);
    const table = result.tables[0];
    const m = guessMapping(table);
    expect(m.headerRow).toBe(2);
    const ds = buildUploadDataset(table, m, { entityName: 'Beispiel', title: 'sample.xlsx' }).dataset!;
    expect(ds.facts.map((f) => f.labelDe)).toEqual(['Umsatzerlöse', 'Personalaufwand', 'Jahresüberschuss']);
    expect(ds.facts[0].values['2024']).toBe(1250000.25);
    expect(ds.facts[1].values['2023']).toBe(650000); // text cell "650.000,00" in a numeric column
    expect(ds.facts[2].values['2023']).toBeNull();
  });

  it('recognises a dataset JSON, including the older schema 0.2', async () => {
    const old = JSON.stringify({
      schemaVersion: '0.2',
      entity: { id: 'x', name: 'Alt GmbH' },
      source: { title: 'Bericht 2024' },
      periods: [
        { id: '2024', start: '2024-01-01', end: '2024-12-31' },
        { id: '2023', start: '2023-01-01', end: '2023-12-31' },
      ],
      conventions: { currency: 'EUR' },
      statements: { data: { labelDe: 'Daten' } },
      views: [{ id: 'data', labelDe: 'Daten', statements: ['data'] }],
      facts: [
        { key: 'a', statement: 'data', labelDe: 'A', unit: 'EUR', values: { '2024': 3, '2023': 1 } },
        { key: 'b', statement: 'data', labelDe: 'B', unit: 'EUR', values: { '2024': 1, '2023': 1 } },
      ],
      derivedKpis: [],
      checks: [{ id: 'c', labelDe: 'A - B = 2', lhs: 'a - b', rhs: 'a - b' }],
    });
    const result = await readUpload(fileOf('alt.json', old));
    expect(result.kind).toBe('dataset');
    if (result.kind === 'dataset') {
      expect(result.dataset.sources.map((s) => s.period)).toEqual(['2024', '2023']);
      expect(validateDataset(result.dataset).ok).toBe(true);
    }
  });

  it('turns JSON rows and JSON objects into tables', async () => {
    const rows = await readUpload(fileOf('a.json', JSON.stringify([{ Posten: 'Umsatz', '2023': 1, '2024': 2 }])));
    expect(rows.kind === 'tables' && rows.tables[0].rows).toEqual([['Posten', '2023', '2024'], ['Umsatz', 1, 2]]);
    const obj = await readUpload(fileOf('b.json', JSON.stringify({ Umsatz: { '2023': 1, '2024': 2 } })));
    expect(obj.kind === 'tables' && obj.tables[0].rows[0]).toEqual(['Bezeichnung', '2023', '2024']);
  });

  it('rejects unsupported, empty and broken files with a clear message', async () => {
    await expect(readUpload(fileOf('a.xls', 'x'))).rejects.toThrow(UploadError);
    await expect(readUpload(fileOf('a.pdf', 'x'))).rejects.toThrow(/nicht unterstützt/);
    await expect(readUpload(fileOf('a.csv', ''))).rejects.toThrow(/leer/);
    await expect(readUpload(fileOf('a.json', '{oops'))).rejects.toThrow(/kein gültiges JSON/);
    await expect(readUpload(fileOf('a.json', '[1,2]'))).rejects.toThrow(/weder ein Datensatz/);
    await expect(readUpload(fileOf('a.json', '{"schemaVersion":"0.3","facts":[]}'))).rejects.toThrow(/Kein gültiger Datensatz/);
    await expect(readUpload(fileOf('a.xlsx', 'not a zip'))).rejects.toThrow(/Excel-Datei/);
  });
});

describe('withGenericView', () => {
  it('keeps datasets with a known view and adds a data view to others', () => {
    const base = {
      statements: { s: { labelDe: 'S' } },
      views: [{ id: 'custom', labelDe: 'C', statements: ['s'] }],
      facts: [{ key: 'a', statement: 's', labelDe: 'A', unit: 'EUR', values: {} }],
    } as never;
    const out = withGenericView(base, ['balance']);
    expect(out.views.map((v) => v.id)).toEqual(['data']);
    expect(withGenericView(base, ['custom'])).toBe(base);
  });
});

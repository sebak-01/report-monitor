import { DatasetError, parseDataset } from '../dataset';
import type { Dataset } from '../../types';
import { looksLikeExtract, readReportMeta, type ReportExtract } from '../extract/detect';
import { parseCsv } from './csv';
import type { RawTable } from './mapping';
import type { Cell } from './numbers';

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_ROWS = 50_000;
export const ACCEPTED_EXTENSIONS = ['.csv', '.tsv', '.txt', '.xlsx', '.json'];

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

export type UploadResult =
  | { kind: 'dataset'; dataset: Dataset; fileName: string }
  | { kind: 'tables'; tables: RawTable[]; fileName: string; truncated: boolean }
  | { kind: 'extract'; extract: ReportExtract; periodId: string; entityName: string; fileName: string };

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot).toLowerCase();
}

/** UTF-8 first; German Excel exports are often Windows-1252, which is not valid UTF-8. */
export function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

function normalizeCell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  return String(value);
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** JSON that is not a dataset: an array of records, or an object of records ({ "Umsatz": { "2023": 1, "2024": 2 } }). */
function tableFromJson(json: unknown): RawTable | null {
  let records: Record<string, unknown>[] | null = null;
  let withKeys = false;
  if (Array.isArray(json) && json.length > 0 && json.every(isRecord)) {
    records = json;
  } else if (isRecord(json)) {
    const entries = Object.entries(json);
    if (entries.length > 0 && entries.every(([, v]) => isRecord(v))) {
      records = entries.map(([key, v]) => ({ Bezeichnung: key, ...(v as Record<string, unknown>) }));
      withKeys = true;
    }
  }
  if (!records) return null;

  const columns: string[] = [];
  for (const record of records) {
    for (const key of Object.keys(record)) if (!columns.includes(key)) columns.push(key);
  }
  if (columns.length === 0) return null;
  // JavaScript lists integer-like keys ("2023") before all others; put the descriptive columns first again.
  const isYear = (c: string) => /^\d{4}$/.test(c);
  columns.sort((a, b) => Number(isYear(a)) - Number(isYear(b)) || (isYear(a) && isYear(b) ? a.localeCompare(b) : 0));
  if (withKeys) {
    columns.splice(columns.indexOf('Bezeichnung'), 1);
    columns.unshift('Bezeichnung');
  }
  const rows: Cell[][] = [columns, ...records.map((r) => columns.map((c) => normalizeCell(r[c])))];
  return { name: 'JSON', rows };
}

function looksLikeDataset(json: unknown): boolean {
  return isRecord(json) && ('schemaVersion' in json || ('facts' in json && 'periods' in json));
}

async function readXlsx(file: File): Promise<RawTable[]> {
  const { default: readExcelFile } = await import('read-excel-file/universal');
  let sheets;
  try {
    sheets = await readExcelFile(file);
  } catch {
    throw new UploadError('Die Excel-Datei konnte nicht gelesen werden. Unterstützt wird das Format .xlsx.');
  }
  return sheets.map((sheet) => ({
    name: sheet.sheet,
    rows: sheet.data.map((row) => row.map(normalizeCell)),
  }));
}

/** Reads an uploaded file completely in the browser. Nothing is sent anywhere. */
export async function readUpload(file: File): Promise<UploadResult> {
  const extension = extensionOf(file.name);
  if (extension === '.xls') {
    throw new UploadError('Das alte Excel-Format (.xls) wird nicht unterstützt. Bitte als .xlsx oder .csv speichern.');
  }
  if (!ACCEPTED_EXTENSIONS.includes(extension)) {
    throw new UploadError('Dieses Dateiformat wird nicht unterstützt. Möglich sind CSV, XLSX und JSON.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new UploadError(`Die Datei ist zu groß (höchstens ${MAX_FILE_BYTES / 1024 / 1024} MB).`);
  }
  if (file.size === 0) throw new UploadError('Die Datei ist leer.');

  let tables: RawTable[];
  if (extension === '.xlsx') {
    tables = await readXlsx(file);
  } else {
    const text = decodeText(await file.arrayBuffer());
    if (extension === '.json') {
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new UploadError('Die Datei enthält kein gültiges JSON.');
      }
      if (looksLikeDataset(json)) {
        try {
          return { kind: 'dataset', dataset: parseDataset(json), fileName: file.name };
        } catch (error) {
          if (error instanceof DatasetError) throw new UploadError(`Kein gültiger Datensatz: ${error.message}`);
          throw error;
        }
      }
      if (looksLikeExtract(json)) {
        const meta = readReportMeta(json, file.name);
        return {
          kind: 'extract',
          extract: json,
          periodId: meta.periodId,
          entityName: meta.entityName,
          fileName: file.name,
        };
      }
      const table = tableFromJson(json);
      if (!table) {
        throw new UploadError(
          'Die JSON-Datei ist weder ein Datensatz dieses Dashboards, ein Berichts-Extrakt (pages mit Text) noch eine Liste von Zeilen (Objekten).',
        );
      }
      tables = [table];
    } else {
      tables = [{ name: file.name, rows: parseCsv(text) }];
    }
  }

  tables = tables.filter((t) => t.rows.some((row) => row.some((c) => c !== null && String(c).trim() !== '')));
  if (tables.length === 0) throw new UploadError('Die Datei enthält keine Daten.');

  let truncated = false;
  tables = tables.map((table) => {
    if (table.rows.length <= MAX_ROWS) return table;
    truncated = true;
    return { ...table, rows: table.rows.slice(0, MAX_ROWS) };
  });
  return { kind: 'tables', tables, fileName: file.name, truncated };
}

/** Reads several uploaded files, one result per file (extracts can be merged). */
export async function readUploads(
  files: File[],
): Promise<{ results: (UploadResult | { kind: 'error'; fileName: string; message: string })[] }> {
  const results = await Promise.all(
    files.map(async (file) => {
      try {
        return await readUpload(file);
      } catch (error) {
        return {
          kind: 'error' as const,
          fileName: file.name,
          message: error instanceof UploadError ? error.message : 'Die Datei konnte nicht gelesen werden.',
        };
      }
    }),
  );
  return { results };
}

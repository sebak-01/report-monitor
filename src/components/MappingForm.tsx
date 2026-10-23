import { useId } from 'react';
import { de } from '../i18n/de';
import {
  columnCount,
  columnName,
  extractPeriodId,
  UNITS,
  type Mapping,
  type RawTable,
} from '../lib/upload/mapping';
import type { NumberFormat } from '../lib/upload/numbers';
import type { Unit } from '../types';

interface Props {
  table: RawTable;
  mapping: Mapping;
  detectedFormat: NumberFormat;
  onChange: (mapping: Mapping) => void;
}

function headerText(table: RawTable, mapping: Mapping, col: number): string {
  const cell = table.rows[mapping.headerRow]?.[col];
  const text = cell === null || cell === undefined ? '' : String(cell).trim();
  return text.length > 28 ? `${text.slice(0, 27)}…` : text;
}

function Field({ label, children }: { label: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}

/** The column-mapping step: which column holds the labels, which columns hold which year. */
export function MappingForm({ table, mapping, detectedFormat, onChange }: Props) {
  const width = columnCount(table);
  const columns = Array.from({ length: width }, (_, col) => col);
  const set = (patch: Partial<Mapping>) => onChange({ ...mapping, ...patch });
  const columnOption = (col: number) => {
    const text = headerText(table, mapping, col);
    return (
      <option key={col} value={col}>
        {columnName(col)}
        {text ? ` – ${text}` : ''}
      </option>
    );
  };
  const periodOf = (col: number) => mapping.periodCols.find((p) => p.col === col);

  const toggleYearCol = (col: number) => {
    if (periodOf(col)) {
      set({ periodCols: mapping.periodCols.filter((p) => p.col !== col) });
    } else {
      const guess = extractPeriodId(table.rows[mapping.headerRow]?.[col]) ?? '';
      set({ periodCols: [...mapping.periodCols, { col, periodId: guess }].sort((a, b) => a.col - b.col) });
    }
  };
  const setYear = (col: number, periodId: string) =>
    set({ periodCols: mapping.periodCols.map((p) => (p.col === col ? { ...p, periodId } : p)) });

  return (
    <div className="mapping-form">
      <div className="field-grid">
        <Field label={de.upload.layout}>
          {(id) => (
            <select id={id} value={mapping.layout} onChange={(e) => set({ layout: e.target.value as Mapping['layout'] })}>
              <option value="wide">{de.upload.layoutWide}</option>
              <option value="long">{de.upload.layoutLong}</option>
            </select>
          )}
        </Field>
        <Field label={de.upload.headerRow}>
          {(id) => (
            <select id={id} value={mapping.headerRow} onChange={(e) => set({ headerRow: Number(e.target.value) })}>
              {table.rows.slice(0, 30).map((_, row) => (
                <option key={row} value={row}>
                  {row + 1}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={de.upload.labelCol}>
          {(id) => (
            <select id={id} value={mapping.labelCol} onChange={(e) => set({ labelCol: Number(e.target.value) })}>
              {columns.map(columnOption)}
            </select>
          )}
        </Field>
        {mapping.layout === 'long' && (
          <>
            <Field label={de.upload.periodCol}>
              {(id) => (
                <select id={id} value={mapping.periodCol} onChange={(e) => set({ periodCol: Number(e.target.value) })}>
                  {columns.map(columnOption)}
                </select>
              )}
            </Field>
            <Field label={de.upload.valueCol}>
              {(id) => (
                <select id={id} value={mapping.valueCol} onChange={(e) => set({ valueCol: Number(e.target.value) })}>
                  {columns.map(columnOption)}
                </select>
              )}
            </Field>
          </>
        )}
        <Field label={de.upload.unit}>
          {(id) => (
            <select id={id} value={mapping.unit} onChange={(e) => set({ unit: e.target.value as Unit })}>
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {de.upload.units[unit as 'EUR' | 'TEUR' | 'count' | 'pct']}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={de.upload.numberFormat}>
          {(id) => (
            <select
              id={id}
              value={mapping.numberFormat}
              onChange={(e) => set({ numberFormat: e.target.value as Mapping['numberFormat'] })}
            >
              <option value="auto">
                {de.upload.formatAuto(detectedFormat === 'de' ? de.upload.formatDeShort : de.upload.formatEnShort)}
              </option>
              <option value="de">{de.upload.formatDe}</option>
              <option value="en">{de.upload.formatEn}</option>
            </select>
          )}
        </Field>
      </div>

      {mapping.layout === 'wide' && (
        <fieldset className="year-cols">
          <legend>{de.upload.yearCols}</legend>
          <p className="muted">{de.upload.yearColsHint}</p>
          <ul>
            {columns
              .filter((col) => col !== mapping.labelCol)
              .map((col) => {
                const period = periodOf(col);
                const text = headerText(table, mapping, col);
                return (
                  <li key={col}>
                    <label>
                      <input type="checkbox" checked={Boolean(period)} onChange={() => toggleYearCol(col)} />{' '}
                      {columnName(col)}
                      {text ? ` – ${text}` : ''}
                    </label>
                    {period && (
                      <input
                        type="text"
                        inputMode="numeric"
                        className="year-input"
                        value={period.periodId}
                        maxLength={4}
                        aria-label={de.upload.yearInput(columnName(col))}
                        onChange={(e) => setYear(col, e.target.value.trim())}
                      />
                    )}
                  </li>
                );
              })}
          </ul>
        </fieldset>
      )}
    </div>
  );
}

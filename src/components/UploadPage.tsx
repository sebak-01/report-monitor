import { useCallback, useId, useMemo, useRef, useState, type DragEvent } from 'react';
import { de } from '../i18n/de';
import { formatByUnit } from '../lib/format';
import { validateDataset } from '../lib/validate';
import { parseReport, type ParsedReport } from '../lib/extract/buildDataset';
import {
  buildUploadDataset,
  columnCount,
  columnName,
  guessMapping,
  type Mapping,
  type RawTable,
} from '../lib/upload/mapping';
import { importDataset, importReports, matchCandidates, storedFileNames } from '../lib/upload/merge';
import {
  ACCEPTED_EXTENSIONS,
  readUploads,
  UploadError,
  type UploadResult,
} from '../lib/upload/readFile';
import { DEDICATED_VIEWS, withGenericView } from '../lib/upload/renderable';
import type { StoredDataset } from '../lib/upload/storage';
import type { Dataset } from '../types';
import { MappingForm } from './MappingForm';

interface Props {
  stored: StoredDataset[];
  /** The empty start view, offered as "Keine Daten". */
  builtinOptions: { id: string; name: string }[];
  activeId: string;
  /** Saves the dataset and shows it. Resolves to false when the browser refused to store it. */
  onImport: (item: StoredDataset) => Promise<boolean>;
  onUse: (id: string) => void;
  onDelete: (id: string) => void;
}

function periodRange(dataset: Dataset): string {
  const ids = dataset.periods.map((p) => p.id).sort();
  return ids.length > 1 ? `${ids[0]}–${ids[ids.length - 1]}` : (ids[0] ?? '');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE');
}

/**
 * Which stored dataset the import is merged into: "auto" is the first name match,
 * "new" keeps it as its own source, a stored id is an explicit choice.
 */
function useTarget(candidates: StoredDataset[]): {
  target: StoredDataset | null;
  selection: string;
  pickTarget: (selection: string) => void;
} {
  const [selection, setSelection] = useState('auto');
  const target =
    selection === 'new'
      ? null
      : selection === 'auto'
        ? (candidates[0] ?? null)
        : (candidates.find((c) => c.id === selection) ?? null);
  return { target, selection, pickTarget: setSelection };
}

function MergeTargetPicker({
  candidates,
  target,
  onPick,
}: {
  candidates: StoredDataset[];
  target: StoredDataset | null;
  onPick: (selection: string) => void;
}) {
  if (candidates.length === 0) return null;
  return (
    <p role="status">
      {target ? de.upload.mergeInto(target.name) : de.upload.mergeAsNewHint}{' '}
      {candidates.length > 1 ? (
        <>
          <label htmlFor="merge-target">{de.upload.mergeAssign}</label>{' '}
          <select id="merge-target" value={target?.id ?? 'new'} onChange={(e) => onPick(e.target.value)}>
            <option value="new">{de.upload.mergeNewSource}</option>
            {candidates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </>
      ) : (
        <label>
          <input type="checkbox" checked={!target} onChange={(e) => onPick(e.target.checked ? 'new' : 'auto')} />{' '}
          {de.upload.mergeAsNew}
        </label>
      )}
    </p>
  );
}

function DuplicateWarning({ duplicate }: { duplicate: { file: string; item: StoredDataset } | null }) {
  if (!duplicate) return null;
  return (
    <p className="message message--warn" role="alert">
      {de.upload.duplicateFile(duplicate.file, duplicate.item.name)}
    </p>
  );
}

/** A file that is already part of a stored dataset: importing it again replaces that year. */
function findDuplicate(stored: StoredDataset[], fileNames: string[]): { file: string; item: StoredDataset } | null {
  for (const file of fileNames) {
    const item = stored.find((s) => storedFileNames(s).includes(file));
    if (item) return { file, item };
  }
  return null;
}

function DropZone({ onFiles, busy }: { onFiles: (files: File[]) => void; busy: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const hintId = useId();

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  };

  return (
    <div
      className={`dropzone${over ? ' dropzone--over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <p className="dropzone-title">{busy ? de.upload.reading : de.upload.dropTitleMulti}</p>
      <p className="muted">{de.upload.or}</p>
      <button type="button" className="button" disabled={busy} onClick={() => inputRef.current?.click()} aria-describedby={hintId}>
        {de.upload.chooseMulti}
      </button>
      <p className="muted" id={hintId}>
        {de.upload.formatsMulti}
      </p>
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple
        accept={ACCEPTED_EXTENSIONS.join(',')}
        data-testid="file-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onFiles(files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function RawPreview({ table, mapping }: { table: RawTable; mapping: Mapping }) {
  const width = Math.min(columnCount(table), 8);
  const rows = table.rows.slice(0, 12);
  return (
    <div className="data-table">
      <h4 className="statement-title">{de.upload.rawPreview}</h4>
      <p className="card-subtitle">{de.upload.rawPreviewHint}</p>
      <div className="table-scroll" role="region" aria-label={de.upload.rawPreview} tabIndex={0}>
        <table className="raw-preview">
          <thead>
            <tr>
              <th scope="col" aria-label="Zeile" />
              {Array.from({ length: width }, (_, col) => (
                <th scope="col" key={col}>
                  {columnName(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className={r === mapping.headerRow ? 'row-header' : r < mapping.headerRow ? 'row-skipped' : undefined}>
                <th scope="row">{r + 1}</th>
                {Array.from({ length: width }, (_, col) => (
                  <td key={col}>{row[col] === null || row[col] === undefined ? '' : String(row[col])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Messages({ title, items, tone }: { title: string; items: string[]; tone: 'warn' | 'error' }) {
  if (items.length === 0) return null;
  return (
    <div className={`message message--${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <strong>{title}</strong>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function NameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{de.upload.entityName}</label>
      <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function TableImport({
  upload,
  stored,
  onImport,
  onCancel,
}: {
  upload: Extract<UploadResult, { kind: 'tables' }>;
  stored: StoredDataset[];
  onImport: (item: StoredDataset) => void | Promise<unknown>;
  onCancel: () => void;
}) {
  const [tableIndex, setTableIndex] = useState(0);
  const table = upload.tables[tableIndex];
  const [mapping, setMapping] = useState<Mapping>(() => guessMapping(upload.tables[0]));
  const defaultName = upload.fileName.replace(/\.[^.]+$/, '');
  const [name, setName] = useState(defaultName);
  const tableId = useId();

  const result = useMemo(
    () => buildUploadDataset(table, mapping, { entityName: name, title: upload.fileName }),
    [table, mapping, name, upload.fileName],
  );
  const candidates = matchCandidates(stored, [name]);
  const { target, pickTarget } = useTarget(candidates);
  const merged = useMemo(
    () => (result.dataset ? importDataset(target, withGenericView(result.dataset, DEDICATED_VIEWS), name, upload.fileName) : null),
    [result.dataset, target, name, upload.fileName],
  );
  const duplicate = findDuplicate(stored, [upload.fileName]);
  const dataset = merged?.item.dataset ?? null;

  const pickTable = (index: number) => {
    setTableIndex(index);
    setMapping(guessMapping(upload.tables[index]));
  };

  return (
    <section className="card" aria-labelledby="mapping-title">
      <h3 id="mapping-title" className="card-title">
        {de.upload.stepMapping}
      </h3>
      {upload.truncated && <p className="muted">{de.upload.truncated}</p>}
      {upload.tables.length > 1 && (
        <div className="field">
          <label htmlFor={tableId}>{de.upload.table}</label>
          <select id={tableId} value={tableIndex} onChange={(e) => pickTable(Number(e.target.value))}>
            {upload.tables.map((t, i) => (
              <option key={t.name + i} value={i}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <NameField value={name} onChange={setName} />
      <MergeTargetPicker candidates={candidates} target={target} onPick={pickTarget} />
      <DuplicateWarning duplicate={duplicate} />
      <RawPreview table={table} mapping={mapping} />
      <MappingForm table={table} mapping={mapping} detectedFormat={result.numberFormat} onChange={setMapping} />

      <h3 className="card-title">{de.upload.stepPreview}</h3>
      <Messages title={de.upload.errors} items={result.errors} tone="error" />
      <Messages title={de.upload.warnings} items={[...result.warnings, ...(merged?.warnings ?? [])]} tone="warn" />
      {dataset && (
        <>
          <p>
            <strong>{de.upload.resultTitle}:</strong>{' '}
            {de.upload.result(dataset.facts.length, periodRange(dataset))}
          </p>
          <div className="table-scroll" role="region" aria-label={de.upload.resultTitle} tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">{de.table.position}</th>
                  {dataset.periods.map((p) => (
                    <th scope="col" className="num" key={p.id}>
                      {p.id}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataset.facts.slice(0, 10).map((fact) => (
                  <tr key={fact.key}>
                    <th scope="row">{fact.labelDe}</th>
                    {dataset.periods.map((p) => (
                      <td className="num" key={p.id}>
                        {formatByUnit(fact.values[p.id] ?? null, fact.unit)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dataset.facts.length > 10 && <p className="muted">… {dataset.facts.length - 10} weitere</p>}
        </>
      )}
      <div className="actions">
        <button
          type="button"
          className="button button--primary"
          disabled={!merged?.item}
          onClick={() => merged && void onImport(merged.item)}
        >
          {duplicate ? de.upload.importOverwrite : de.upload.import}
        </button>
        <button type="button" className="button" onClick={onCancel}>
          {de.upload.cancel}
        </button>
      </div>
    </section>
  );
}

function DatasetImport({
  upload,
  stored,
  onImport,
  onCancel,
}: {
  upload: Extract<UploadResult, { kind: 'dataset' }>;
  stored: StoredDataset[];
  onImport: (item: StoredDataset) => void | Promise<unknown>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(upload.dataset.entity.name);
  const prepared = useMemo(() => withGenericView(upload.dataset, DEDICATED_VIEWS), [upload.dataset]);
  const report = useMemo(() => validateDataset(prepared), [prepared]);
  const candidates = matchCandidates(stored, [name.trim() || prepared.entity.name, prepared.entity.name]);
  const { target, pickTarget } = useTarget(candidates);
  const merged = useMemo(() => importDataset(target, prepared, name, upload.fileName), [target, prepared, name, upload.fileName]);
  const duplicate = findDuplicate(stored, [upload.fileName]);
  const dataset = merged.item.dataset;
  return (
    <section className="card" aria-labelledby="dataset-found-title">
      <h3 id="dataset-found-title" className="card-title">
        {de.upload.datasetFound}
      </h3>
      <p>
        {de.upload.datasetSummary(dataset.facts.length, periodRange(dataset), dataset.checks.length)}
      </p>
      {dataset.checks.length > 0 && (
        <p className={`validation-status validation-status--${report.ok ? 'ok' : 'failed'}`} role="status">
          <span aria-hidden="true">{report.ok ? '✓' : '✗'}</span>{' '}
          {report.ok ? de.upload.checksOk : de.upload.checksFailed(report.failed)}
        </p>
      )}
      <NameField value={name} onChange={setName} />
      <MergeTargetPicker candidates={candidates} target={target} onPick={pickTarget} />
      <DuplicateWarning duplicate={duplicate} />
      <Messages title={de.upload.warnings} items={merged.warnings} tone="warn" />
      <div className="actions">
        <button
          type="button"
          className="button button--primary"
          onClick={() => void onImport(merged.item)}
        >
          {duplicate ? de.upload.importOverwrite : de.upload.import}
        </button>
        <button type="button" className="button" onClick={onCancel}>
          {de.upload.cancel}
        </button>
      </div>
    </section>
  );
}

/** Reports (one per year) merged into one multi-year dataset. */
function ExtractImport({
  reports,
  stored,
  onImport,
  onCancel,
}: {
  reports: ParsedReport[];
  stored: StoredDataset[];
  onImport: (item: StoredDataset) => void | Promise<unknown>;
  onCancel: () => void;
}) {
  const incomingNames = [...new Set(reports.map((r) => r.meta.entityName).filter((n) => n.trim() !== ''))];
  const defaultName = reports[reports.length - 1]?.meta.entityName ?? '';
  const candidates = matchCandidates(stored, incomingNames);
  const { target, pickTarget } = useTarget(candidates);
  const [name, setName] = useState(() => candidates[0]?.name ?? defaultName);
  // Picking a target also adopts its display name, so merging never renames the stored source.
  const pick = (selection: string) => {
    pickTarget(selection);
    const picked =
      selection === 'new' ? null : selection === 'auto' ? candidates[0] : candidates.find((c) => c.id === selection);
    setName(picked?.name ?? defaultName);
  };

  const result = useMemo(() => {
    try {
      return { ...importReports(target, reports, name), error: null as string | null };
    } catch (error) {
      return {
        item: null as StoredDataset | null,
        warnings: [] as string[],
        error: error instanceof Error ? error.message : 'Die Berichte konnten nicht zusammengeführt werden.',
      };
    }
  }, [target, reports, name]);

  const duplicate = findDuplicate(stored, reports.map((r) => r.fileName));
  const dataset = result.item?.dataset ?? null;
  const periods = dataset?.periods.map((p) => p.id).join(', ') ?? '';
  const factCount = dataset?.facts.length ?? 0;
  const scheduleRows = dataset?.schedules?.reduce((n, s) => n + s.rows.length, 0) ?? 0;

  return (
    <section className="card" aria-labelledby="extract-title">
      <h3 id="extract-title" className="card-title">
        {de.upload.reportsFound(reports.length)}
      </h3>
      <ul className="stored-list">
        {reports.map((report) => (
          <li key={report.fileName}>
            <span>
              <strong>{report.meta.periodId}</strong>{' '}
              <span className="muted">
                · {report.fileName} · {report.facts.length} Positionen
                {report.schedule ? ` · Anlagespiegel (${report.schedule.rows.length} Zeilen)` : ''}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {result.error && (
        <p className="message message--error" role="alert">
          {result.error}
        </p>
      )}
      <MergeTargetPicker candidates={candidates} target={target} onPick={pick} />
      <DuplicateWarning duplicate={duplicate} />
      <Messages
        title={de.upload.warnings}
        items={[
          ...reports.flatMap((r) => r.warnings.map((w) => `${r.meta.periodId}: ${w}`)),
          ...result.warnings,
        ]}
        tone="warn"
      />
      {dataset && (
        <>
          <p>
            <strong>{de.upload.resultTitle}:</strong> {de.upload.result(factCount, periods)}
            {scheduleRows > 0 ? ` · ${de.upload.scheduleRows(scheduleRows)}` : ''}
          </p>
          <NameField value={name} onChange={setName} />
        </>
      )}
      <div className="actions">
        <button
          type="button"
          className="button button--primary"
          disabled={!result.item}
          onClick={() => result.item && void onImport(result.item)}
        >
          {duplicate ? de.upload.importOverwrite : de.upload.import}
        </button>
        <button type="button" className="button" onClick={onCancel}>
          {de.upload.cancel}
        </button>
      </div>
    </section>
  );
}

function StoredList({ stored, builtinOptions, activeId, onUse, onDelete }: Omit<Props, 'onImport'>) {
  return (
    <section className="card" aria-labelledby="stored-title">
      <h3 id="stored-title" className="card-title">
        {de.upload.storedTitle}
      </h3>
      <ul className="stored-list">
        {builtinOptions.map((option) => (
          <li key={option.id}>
            <span>
              <strong>{option.name}</strong>
            </span>
            {activeId === option.id ? (
              <span className="pill">{de.upload.inUse}</span>
            ) : (
              <button type="button" className="button" onClick={() => onUse(option.id)}>
                {de.upload.use}
              </button>
            )}
          </li>
        ))}
        {stored.map((item) => (
          <li key={item.id}>
            <span>
              <strong>{item.name}</strong>{' '}
              <span className="muted">
                · {item.fileName} · {periodRange(item.dataset)} · {de.upload.loadedOn(formatDate(item.createdAt))}
              </span>
            </span>
            <span className="row-actions">
              {activeId === item.id ? (
                <span className="pill">{de.upload.inUse}</span>
              ) : (
                <button type="button" className="button" onClick={() => onUse(item.id)}>
                  {de.upload.use}
                </button>
              )}
              <button
                type="button"
                className="button button--danger"
                aria-label={de.upload.removeLabel(item.name)}
                onClick={() => onDelete(item.id)}
              >
                {de.upload.remove}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {stored.length === 0 && <p className="muted">{de.upload.storedEmpty}</p>}
    </section>
  );
}

/** The page behind "Daten hochladen": drop files, map columns, check the preview, import. */
export function UploadPage(props: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [reports, setReports] = useState<ParsedReport[] | null>(null);
  const [saveWarning, setSaveWarning] = useState(false);

  const onFiles = useCallback(async (files: File[]) => {
    setBusy(true);
    setError(null);
    setUpload(null);
    setReports(null);
    try {
      const { results } = await readUploads(files);
      const extracts = results.filter((r) => r.kind === 'extract');
      const failed = results.filter((r) => r.kind === 'error');
      const others = results.filter((r) => r.kind === 'dataset' || r.kind === 'tables');

      if (failed.length > 0) {
        setError(failed.map((f) => `${f.fileName}: ${f.message}`).join(' · '));
      }
      if (extracts.length > 0) {
        const parsed = extracts.map((e) => parseReport(e.extract, e.fileName));
        setReports(parsed);
        return;
      }
      if (others.length > 0) {
        if (others.length > 1) {
          setError(de.upload.oneAtATime);
        }
        setUpload(others[0] as UploadResult);
      }
    } catch (e) {
      setError(e instanceof UploadError ? e.message : 'Die Datei konnte nicht gelesen werden.');
    } finally {
      setBusy(false);
    }
  }, []);

  const onImport = async (item: StoredDataset) => {
    const saved = await props.onImport(item);
    setSaveWarning(!saved);
    if (saved) {
      setUpload(null);
      setReports(null);
    }
  };

  return (
    <>
      <p className="intro">{de.upload.introMulti}</p>
      <DropZone onFiles={onFiles} busy={busy} />
      {error && (
        <p className="message message--error" role="alert">
          {error}
        </p>
      )}
      {saveWarning && (
        <p className="message message--warn" role="status">
          {de.upload.saveFailed}
        </p>
      )}
      {reports && <ExtractImport reports={reports} stored={props.stored} onImport={onImport} onCancel={() => setReports(null)} />}
      {upload?.kind === 'tables' && (
        <TableImport upload={upload} stored={props.stored} onImport={onImport} onCancel={() => setUpload(null)} />
      )}
      {upload?.kind === 'dataset' && (
        <DatasetImport upload={upload} stored={props.stored} onImport={onImport} onCancel={() => setUpload(null)} />
      )}
      <StoredList
        stored={props.stored}
        builtinOptions={props.builtinOptions}
        activeId={props.activeId}
        onUse={props.onUse}
        onDelete={props.onDelete}
      />
    </>
  );
}

import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { ViewSelect } from './components/ViewSelect';
import { de } from './i18n/de';
import { fetchDataset, previousPeriodId, selectablePeriods, sourceFor } from './lib/dataset';
import { PeriodSelect } from './components/PeriodSelect';
import { SourceSelect } from './components/SourceSelect';
import { UploadPage } from './components/UploadPage';
import {
  deleteStored,
  listStored,
  readActiveSource,
  saveStored,
  writeActiveSource,
  type StoredDataset,
} from './lib/upload/storage';
import { DataView } from './views/DataView';
import { reportForView, validateDataset } from './lib/validate';
import type { Dataset } from './types';
import { BalanceView } from './views/BalanceView';
import type { ViewProps } from './views/common';
import { IncomeView } from './views/IncomeView';

/**
 * Bundled datasets, first one that loads wins. The pilot dataset is not part of the public
 * repository; demo.json (invented figures) is the fallback that is always there.
 */
const DATASET_URLS = ['fgk.json', 'demo.json'].map((name) => `${import.meta.env.BASE_URL}data/${name}`);

async function loadBundled(): Promise<Dataset> {
  let lastError: unknown;
  for (const url of DATASET_URLS) {
    try {
      return await fetchDataset(url);
    } catch (error) {
      lastError = error; // a missing file (or the HTML a dev server returns for it) falls through to the next one
    }
  }
  throw lastError;
}

/** The component that renders each view id of the dataset. */
const VIEW_COMPONENTS: Record<string, ComponentType<ViewProps>> = {
  balance: BalanceView,
  income: IncomeView,
  data: DataView,
};

const BUILTIN = 'builtin';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; dataset: Dataset };

/** The selected view and year live in the URL hash (#/balance/2024), so a page can be linked and reloaded. */
function readHash(viewIds: string[], periodIds: string[]): { view: string; period: string } {
  const [viewPart, periodPart] = window.location.hash.replace(/^#\/?/, '').split('/');
  return {
    view: viewIds.includes(viewPart) ? viewPart : viewIds[0],
    period: periodIds.includes(periodPart) ? periodPart : periodIds[periodIds.length - 1],
  };
}

function useSelection(viewIds: string[], periodIds: string[]) {
  const [selection, setSelection] = useState(() => readHash(viewIds, periodIds));

  useEffect(() => {
    const onHashChange = () => setSelection(readHash(viewIds, periodIds));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [viewIds, periodIds]);

  const go = useCallback((view: string, period: string) => {
    window.location.hash = `/${view}/${period}`;
  }, []);

  return { ...selection, go };
}

function useIsUploadRoute(): boolean {
  const read = () => /^#\/?upload/.test(window.location.hash);
  const [isUpload, setIsUpload] = useState(read);
  useEffect(() => {
    const onHashChange = () => setIsUpload(read());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return isUpload;
}

export default function App() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [stored, setStored] = useState<StoredDataset[]>([]);
  const [storedLoaded, setStoredLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string>(() => readActiveSource() ?? BUILTIN);
  const isUpload = useIsUploadRoute();

  useEffect(() => {
    let cancelled = false;
    loadBundled().then(
      (dataset) => !cancelled && setState({ status: 'ready', dataset }),
      (error: unknown) =>
        !cancelled &&
        setState({ status: 'error', message: error instanceof Error ? error.message : String(error) }),
    );
    listStored().then((items) => {
      if (cancelled) return;
      // Datasets added during this visit (e.g. when the browser refuses to store) stay in the list.
      setStored((current) => [...current, ...items.filter((i) => !current.some((c) => c.id === i.id))]);
      setStoredLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const builtin = state.status === 'ready' ? state.dataset : null;
  const active = activeId === BUILTIN ? null : (stored.find((item) => item.id === activeId) ?? null);
  // A remembered upload that no longer exists falls back to the bundled data.
  const dataset = active ? active.dataset : builtin;
  const effectiveId = active ? active.id : BUILTIN;

  const use = useCallback((id: string) => {
    setActiveId(id);
    writeActiveSource(id === BUILTIN ? null : id);
  }, []);

  const importDataset = useCallback(
    async (item: StoredDataset) => {
      const saved = await saveStored(item);
      setStored((current) => [item, ...current]);
      use(item.id);
      const periods = selectablePeriods(item.dataset);
      const view = item.dataset.views.find((v) => VIEW_COMPONENTS[v.id]);
      window.location.hash = `/${view?.id ?? 'data'}/${periods[periods.length - 1]?.id ?? ''}`;
      return saved;
    },
    [use],
  );

  const removeDataset = useCallback(
    (id: string) => {
      void deleteStored(id);
      setStored((current) => current.filter((item) => item.id !== id));
      if (activeId === id) use(BUILTIN);
    },
    [activeId, use],
  );

  if (isUpload) {
    return (
      <div className="page">
        <header className="page-header">
          <div className="page-header-main">
            <p className="eyebrow">{de.appTitle}</p>
            <h1>{de.upload.title}</h1>
          </div>
          <a className="button" href="#/">
            {de.upload.back}
          </a>
        </header>
        <main>
          <UploadPage
            stored={stored}
            builtinName={builtin?.entity.name ?? de.upload.builtin}
            activeId={effectiveId}
            onImport={importDataset}
            onUse={use}
            onDelete={removeDataset}
          />
        </main>
      </div>
    );
  }

  const waitingForStored = activeId !== BUILTIN && !storedLoaded && !active;
  if (state.status === 'loading' || waitingForStored) {
    return (
      <main className="page">
        <p role="status">{de.loading}</p>
      </main>
    );
  }
  if (!dataset) {
    return (
      <main className="page">
        <p role="alert">
          {de.loadError} <span className="muted">({state.status === 'error' ? state.message : ''})</span>
        </p>
        <p>
          <a href="#/upload">{de.upload.link}</a>
        </p>
      </main>
    );
  }
  const sourceOptions =
    stored.length > 0
      ? [...(builtin ? [{ id: BUILTIN, name: builtin.entity.name }] : []), ...stored.map((i) => ({ id: i.id, name: i.name }))]
      : [];
  return (
    <Dashboard
      key={effectiveId}
      dataset={dataset}
      sourceOptions={sourceOptions}
      sourceId={effectiveId}
      onSourceChange={use}
    />
  );
}

interface DashboardProps {
  dataset: Dataset;
  sourceOptions: { id: string; name: string }[];
  sourceId: string;
  onSourceChange: (id: string) => void;
}

function Dashboard({ dataset, sourceOptions, sourceId, onSourceChange }: DashboardProps) {
  // Only views this app can render are offered in the dropdown.
  const views = useMemo(() => dataset.views.filter((v) => VIEW_COMPONENTS[v.id]), [dataset]);
  const viewIds = useMemo(() => views.map((v) => v.id), [views]);
  const periodIds = useMemo(() => selectablePeriods(dataset).map((p) => p.id), [dataset]);
  const { view: selectedId, period, go } = useSelection(viewIds, periodIds);
  const fullReport = useMemo(() => validateDataset(dataset), [dataset]);
  const report = useMemo(() => reportForView(fullReport, selectedId), [fullReport, selectedId]);

  const view = views.find((v) => v.id === selectedId) ?? views[0];
  const previous = previousPeriodId(dataset, period);
  const source = sourceFor(dataset, period);
  const status =
    source?.extraction === 'manual'
      ? source.verified === false
        ? de.sourceStatus.manualUnverified
        : de.sourceStatus.manual
      : source?.extraction === 'text-layer' || source?.extraction === 'ocr'
        ? de.sourceStatus.textLayer
        : source?.extraction === 'upload'
          ? de.sourceStatus.upload
          : source?.extraction === 'demo'
            ? de.sourceStatus.demo
            : null;
  const formerName = dataset.entity.formerNames?.[0];

  useEffect(() => {
    if (view) document.title = `${view.labelDe} ${period} – ${dataset.entity.name}`;
  }, [view, period, dataset.entity.name]);

  if (!view) return null;
  const ViewComponent = VIEW_COMPONENTS[view.id];

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-main">
          <p className="eyebrow">{de.appTitle}</p>
          <h1>{dataset.entity.name}</h1>
          <p className="lede">{de.subtitle(period, previous)}</p>
          <p className="header-links">
            <a href="#/upload">{de.upload.link}</a>
          </p>
          {formerName && period < (formerName.until ?? '').slice(0, 4) && (
            <p className="muted">{de.formerName(formerName.name, null)}</p>
          )}
        </div>
        <div className="selects">
          {sourceOptions.length > 0 && (
            <SourceSelect options={sourceOptions} value={sourceId} onChange={onSourceChange} />
          )}
          <ViewSelect views={views} value={view.id} onChange={(id) => go(id, period)} />
          <PeriodSelect periods={periodIds} value={period} onChange={(id) => go(view.id, id)} />
        </div>
        {source && (
          <p className="source">
            {de.source}:{' '}
            {source.url ? (
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.title}
              </a>
            ) : (
              source.title
            )}
            {status && <span className="pill">{status}</span>}
          </p>
        )}
      </header>

      <main>
        <div className="view-heading">
          <h2 className="view-title">{view.labelDe}</h2>
          {view.sourceDe && <p className="view-source">{view.sourceDe}</p>}
        </div>
        <ViewComponent dataset={dataset} periodId={period} report={report} />
      </main>

      <footer className="page-footer">{source?.extraction === 'upload' ? de.upload.footer : source?.extraction === 'demo' ? de.footer.demo : de.footer.note}</footer>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { ViewSelect } from './components/ViewSelect';
import { de } from './i18n/de';
import { previousPeriodId, selectablePeriods, sourceFor } from './lib/dataset';
import { emptyDataset } from './lib/emptyDataset';
import { PeriodSelect } from './components/PeriodSelect';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SourceSelect, type SourceOption } from './components/SourceSelect';
import { UploadPage } from './components/UploadPage';
import {
  fetchSystemDataset,
  fetchSystemManifest,
  systemIdOf,
  systemSourceId,
  type SystemSourceMeta,
} from './lib/systemSources';
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
import { AnlagespiegelView } from './views/AnlagespiegelView';
import { BalanceView } from './views/BalanceView';
import type { ViewProps } from './views/common';
import { IncomeView } from './views/IncomeView';

/** The component that renders each view id of the dataset. */
const VIEW_COMPONENTS: Record<string, ComponentType<ViewProps>> = {
  balance: BalanceView,
  income: IncomeView,
  anlagespiegel: AnlagespiegelView,
  data: DataView,
};

const BUILTIN = 'builtin';
const PORTAL_URL = 'https://open.rlp.de';
const LICENSE_URL = 'https://www.govdata.de/dl-de/by-2-0';

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
  const [stored, setStored] = useState<StoredDataset[]>([]);
  const [storedLoaded, setStoredLoaded] = useState(false);
  const [systemMeta, setSystemMeta] = useState<SystemSourceMeta[]>([]);
  const [systemManifestLoaded, setSystemManifestLoaded] = useState(false);
  const [systemDataset, setSystemDataset] = useState<{ id: string; dataset: Dataset } | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string>(() => readActiveSource() ?? BUILTIN);
  const isUpload = useIsUploadRoute();

  useEffect(() => {
    let cancelled = false;
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

  // Sample datasets ship with the site (public/data/) and are only fetched on demand.
  useEffect(() => {
    let cancelled = false;
    fetchSystemManifest()
      .then((manifest) => {
        if (cancelled) return;
        setSystemMeta(manifest.datasets);
        setSystemManifestLoaded(true);
      })
      .catch(() => {
        // Offline or blocked: the sample data stay hidden, uploads keep working.
        if (!cancelled) setSystemManifestLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const systemId = systemIdOf(activeId);
  const activeSystemMeta = systemId ? (systemMeta.find((m) => m.id === systemId) ?? null) : null;

  useEffect(() => {
    if (!activeSystemMeta) {
      setSystemDataset(null);
      setSystemError(null);
      return;
    }
    let cancelled = false;
    setSystemError(null);
    fetchSystemDataset(activeSystemMeta)
      .then((dataset) => {
        if (!cancelled) setSystemDataset({ id: activeSystemMeta.id, dataset });
      })
      .catch(() => {
        if (!cancelled) {
          setSystemDataset(null);
          setSystemError(de.systemLoadError);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeSystemMeta]);

  const active = activeId === BUILTIN ? null : (stored.find((item) => item.id === activeId) ?? null);
  // Without an upload the dashboard shows the empty structure (boxes, no figures).
  const dataset: Dataset = active
    ? active.dataset
    : systemDataset
      ? systemDataset.dataset
      : emptyDataset;
  const effectiveId = active ? active.id : activeId;

  const use = useCallback((id: string) => {
    setActiveId(id);
    writeActiveSource(id === BUILTIN ? null : id);
  }, []);

  // A `system:` id the manifest does not know (e.g. from an earlier release) falls back to the empty view.
  useEffect(() => {
    if (systemManifestLoaded && systemId && !activeSystemMeta) use(BUILTIN);
  }, [systemManifestLoaded, systemId, activeSystemMeta, use]);

  const importDataset = useCallback(
    async (item: StoredDataset) => {
      const saved = await saveStored(item);
      // A merged upload reuses the id of the dataset it belongs to: replace, do not duplicate.
      setStored((current) => [item, ...current.filter((c) => c.id !== item.id)]);
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

  const sourceOptions: SourceOption[] = [
    { id: BUILTIN, name: de.empty.title },
    ...systemMeta.map((m) => ({ id: systemSourceId(m), name: m.name, group: 'system' as const })),
    ...stored.map((i) => ({ id: i.id, name: i.name, group: 'user' as const })),
  ];

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
            systemSources={systemMeta.map((m) => ({ ...m, id: systemSourceId(m) }))}
            builtinOptions={[{ id: BUILTIN, name: de.empty.title }]}
            activeId={activeId}
            onImport={importDataset}
            onUse={use}
            onDelete={removeDataset}
          />
        </main>
      </div>
    );
  }

  const waitingForStored = activeId !== BUILTIN && !storedLoaded && !active && !systemId;
  const waitingForSystem =
    Boolean(systemId) && (!systemManifestLoaded || (Boolean(activeSystemMeta) && !systemDataset && !systemError));
  if (waitingForStored || waitingForSystem) {
    return (
      <main className="page">
        <p role="status">{de.loading}</p>
      </main>
    );
  }
  return (
    <ErrorBoundary key={effectiveId}>
      <Dashboard
        dataset={dataset}
        sourceOptions={sourceOptions}
        sourceId={activeId}
        onSourceChange={use}
        empty={!active && !systemDataset}
        system={Boolean(systemDataset)}
        error={systemError}
      />
    </ErrorBoundary>
  );
}

interface DashboardProps {
  dataset: Dataset;
  sourceOptions: SourceOption[];
  sourceId: string;
  onSourceChange: (id: string) => void;
  /** True when no file is loaded: the boxes show, but without figures. */
  empty: boolean;
  /** True when a shipped sample dataset is active (footer shows the attribution). */
  system: boolean;
  /** Set when the sample dataset could not be loaded. */
  error: string | null;
}

function Dashboard({ dataset, sourceOptions, sourceId, onSourceChange, empty, system, error }: DashboardProps) {
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
          <h1>{empty ? de.empty.title : dataset.entity.name}</h1>
          <p className="lede">{empty ? de.empty.lede : de.subtitle(period, previous)}</p>
          <p className="header-links">
            <a href="#/upload">{de.upload.link}</a>
          </p>
          {formerName && period < (formerName.until ?? '').slice(0, 4) && (
            <p className="muted">{de.formerName(formerName.name, null)}</p>
          )}
        </div>
        <div className="selects">
          {sourceOptions.length > 1 && (
            <SourceSelect options={sourceOptions} value={sourceId} onChange={onSourceChange} />
          )}
          <ViewSelect views={views} value={view.id} onChange={(id) => go(id, period)} />
          <PeriodSelect periods={periodIds} value={period} onChange={(id) => go(view.id, id)} />
        </div>
        {error && (
          <p className="message message--error" role="alert">
            {error}
          </p>
        )}
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
            {source.datasetUrl && (
              <>
                {' · '}
                <a href={source.datasetUrl} target="_blank" rel="noopener noreferrer">
                  {de.sourceDataset}
                </a>
              </>
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

      <footer className="page-footer">
        {system ? (
          <>
            {de.footer.attribution.intro}{' '}
            <a href={PORTAL_URL} target="_blank" rel="noopener noreferrer">
              {de.footer.attribution.portal}
            </a>
            .{' '}
            <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer">
              {de.footer.attribution.license}
            </a>
            . {de.footer.attribution.changes}
          </>
        ) : source?.extraction === 'upload' ? (
          de.upload.footer
        ) : (
          de.footer.note
        )}
      </footer>
    </div>
  );
}

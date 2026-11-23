import { useState, type RefObject } from 'react';
import { metricsToCsv } from '../analysis/export';
import type { MetricRow } from '../analysis/types';
import { de } from '../i18n/de';
import { chartPngDataUrl, downloadDataUrl, downloadTextFile } from '../lib/download';
import { readTokens } from './chartTheme';

interface Props {
  rows: MetricRow[];
  /** All periods of the dataset, oldest first. */
  periodIds: string[];
  /** Name of the company, used in the file names. */
  entityName: string;
  /** Element that contains the chart to export (the whole time series section). */
  chartRootRef: RefObject<HTMLElement | null>;
}

function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'datensatz';
}

/** The "Export" section: metrics as German-locale CSV and the chart as PNG. */
export function AnalysisExport({ rows, periodIds, entityName, chartRootRef }: Props) {
  const [note, setNote] = useState('');
  const slug = slugOf(entityName);

  const saveCsv = () => {
    downloadTextFile(`kennzahlen-${slug}.csv`, metricsToCsv(rows, periodIds));
  };

  const saveChart = () => {
    const root = chartRootRef.current;
    const dataUrl = root ? chartPngDataUrl(root, readTokens(root).surface) : null;
    if (dataUrl) {
      downloadDataUrl(`zeitreihen-${slug}.png`, dataUrl);
    } else {
      setNote(de.analysis.exportNoChart);
    }
  };

  return (
    <section className="card" aria-labelledby="analysis-export-title">
      <h2 id="analysis-export-title" className="card-title">
        {de.analysis.exportTitle}
      </h2>
      <div className="actions">
        <button type="button" className="button button--primary" onClick={saveCsv}>
          {de.analysis.exportCsv}
        </button>
        <button type="button" className="button" onClick={saveChart}>
          {de.analysis.exportChart}
        </button>
      </div>
      <p className="muted">{de.analysis.exportCsvHint}</p>
      <p className="muted">{de.analysis.exportChartHint}</p>
      {note && (
        <p className="muted" role="status">
          {note}
        </p>
      )}
    </section>
  );
}

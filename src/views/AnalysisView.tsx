import { useMemo, useRef } from 'react';
import { computeMetricRows } from '../analysis/metrics';
import { AnalysisChecks } from '../components/AnalysisChecks';
import { AnalysisExport } from '../components/AnalysisExport';
import { MetricTable } from '../components/MetricTable';
import { AnalysisTimeSeries } from '../components/AnalysisTimeSeries';
import { de } from '../i18n/de';
import { createLookup, sortedPeriods } from '../lib/dataset';
import type { ViewProps } from './common';

/**
 * The "Analyse" view: key figures, time series and plausibility checks over
 * all periods of the dataset. Everything is computed locally from the stored
 * fact values; the extraction and the statement views stay untouched.
 */
export function AnalysisView({ dataset, periodId, reports }: ViewProps) {
  const periodIds = useMemo(() => sortedPeriods(dataset).map((p) => p.id), [dataset]);
  const lookup = useMemo(() => createLookup(dataset), [dataset]);
  const metricRows = useMemo(() => computeMetricRows(lookup, periodIds), [lookup, periodIds]);
  // The export button finds the chart instance inside this subtree.
  const chartRootRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <AnalysisChecks dataset={dataset} reports={reports} />
      <p className="analysis-intro">{de.analysis.intro}</p>
      <MetricTable rows={metricRows} periodIds={periodIds} dataset={dataset} />
      <div ref={chartRootRef}>
        <AnalysisTimeSeries dataset={dataset} periodId={periodId} />
      </div>
      <AnalysisExport
        rows={metricRows}
        periodIds={periodIds}
        entityName={dataset.entity.name}
        chartRootRef={chartRootRef}
      />
    </>
  );
}

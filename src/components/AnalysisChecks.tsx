import { useMemo } from 'react';
import type { CheckFinding, FindingSeverity, RawReport } from '../analysis/types';
import {
  checkIdentities,
  checkPriorYearConsistency,
  checkSubTotals,
  DEFAULT_TOLERANCE,
  summarize,
} from '../analysis/validation';
import { de } from '../i18n/de';
import { createLookup, sortedPeriods } from '../lib/dataset';
import type { Dataset } from '../types';

interface Props {
  dataset: Dataset;
  /** Raw extracts for the prior-year comparison; absent for value-level imports. */
  reports?: RawReport[];
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = { fail: 0, warn: 1, skip: 2, pass: 3 };

/**
 * The "Prüfstatus" block: a compact green/amber/red summary of the
 * plausibility checks with an expandable list of findings (German).
 */
export function AnalysisChecks({ dataset, reports }: Props) {
  const summary = useMemo(() => {
    const lookup = createLookup(dataset);
    const periodIds = sortedPeriods(dataset).map((p) => p.id);
    const tolerance = dataset.conventions.tolerance ?? DEFAULT_TOLERANCE;
    const findings: CheckFinding[] = [
      ...checkIdentities(lookup, periodIds, tolerance),
      ...checkSubTotals(lookup, periodIds, tolerance),
      ...(reports
        ? checkPriorYearConsistency(reports, tolerance)
        : [
            {
              id: 'prior_year_values',
              labelDe: 'Vorjahreswerte (Bericht N+1 vs. Bericht N)',
              severity: 'skip' as const,
              detailDe: de.analysis.priorYearUnavailable,
            },
          ]),
    ];
    findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    return summarize(findings);
  }, [dataset, reports]);

  const statusLabel =
    summary.status === 'green'
      ? de.analysis.statusGreen
      : summary.status === 'amber'
        ? de.analysis.statusAmber
        : de.analysis.statusRed;

  return (
    <section className="card" aria-labelledby="analysis-checks-title">
      <h2 id="analysis-checks-title" className="card-title">
        {de.analysis.checksTitle}
      </h2>
      <p className="card-subtitle">{de.analysis.checksIntro}</p>
      <p className={`validation-status validation-status--${summary.status === 'green' ? 'ok' : summary.status === 'red' ? 'failed' : 'warn'}`}>
        {statusLabel}
        <span className="muted">
          {' · '}
          {de.analysis.counts(summary.passed, summary.warned, summary.failed, summary.skipped)}
        </span>
      </p>
      <details className="table-view">
        <summary>{de.analysis.findings}</summary>
        <ul className="finding-list">
          {summary.findings.map((finding, index) => (
            <li key={`${finding.id}-${finding.periodId ?? ''}-${index}`}>
              <span className="pill">{de.analysis.severity[finding.severity]}</span>{' '}
              <strong>{finding.labelDe}</strong>
              {finding.periodId ? ` (${finding.periodId})` : ''}: {finding.detailDe}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

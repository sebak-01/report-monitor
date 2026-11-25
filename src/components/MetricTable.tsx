import { Fragment } from 'react';
import type { MetricRow, MetricYearValue } from '../analysis/types';
import { de } from '../i18n/de';
import { formatByUnit, formatRatio } from '../lib/format';
import type { Dataset } from '../types';

interface Props {
  rows: MetricRow[];
  /** All periods of the dataset, oldest first. */
  periodIds: string[];
  dataset: Dataset;
}

/** Tooltip for a cell: which inputs are missing and which were assumed as 0. */
function cellTitle(year: MetricYearValue | undefined, labelOf: (key: string) => string): string | undefined {
  if (!year) return undefined;
  const lines: string[] = [];
  if (year.note) lines.push(year.note);
  if (year.missing.length > 0) lines.push(de.analysis.naTooltip(year.missing.map(labelOf).join(', ')));
  if (year.assumedZero.length > 0) {
    lines.push(de.analysis.assumedZero(year.assumedZero.map(labelOf).join(', ')));
  }
  return lines.length > 0 ? lines.join(' ') : undefined;
}

/**
 * The "Kennzahlen" section: one row per metric with its value per year and an
 * expandable "Berechnung" row (formula, caveats and the input positions per
 * year). A missing input shows as "n/a" with a tooltip, never as 0.
 */
export function MetricTable({ rows, periodIds, dataset }: Props) {
  const factOf = (key: string) => dataset.facts.find((fact) => fact.key === key);
  const labelOf = (key: string) => factOf(key)?.labelDe ?? key;

  return (
    <section className="card" aria-labelledby="analysis-metrics-title">
      <h2 id="analysis-metrics-title" className="card-title">
        {de.analysis.kennzahlenTitle}
      </h2>
      <p className="card-subtitle">{de.analysis.kennzahlenSubtitle}</p>
      <div className="table-scroll" role="region" aria-label={de.analysis.kennzahlenTitle} tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">{de.analysis.metricColumn}</th>
              {periodIds.map((periodId) => (
                <th scope="col" className="num" key={periodId}>
                  {periodId}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const inputKeys: string[] = [];
              for (const periodId of periodIds) {
                for (const input of row.values[periodId]?.inputs ?? []) {
                  if (!inputKeys.includes(input.key)) inputKeys.push(input.key);
                }
              }
              return (
                <Fragment key={row.spec.id}>
                  <tr className="metric-row">
                    <th scope="row">
                      {row.spec.labelDe}
                      <span className="metric-short">{row.spec.shortDe}</span>
                    </th>
                    {periodIds.map((periodId) => {
                      const year = row.values[periodId];
                      return (
                        <td className="num" key={periodId} title={cellTitle(year, labelOf)}>
                          {year?.value === null || year === undefined ? de.analysis.na : formatRatio(year.value)}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="metric-details">
                    <td colSpan={periodIds.length + 1}>
                      <details className="table-view">
                        <summary>{de.analysis.calculation}</summary>
                        <p>
                          <strong>{de.analysis.formulaLabel}:</strong> {row.spec.formulaDe}
                        </p>
                        {row.spec.caveatDe && <p className="muted">{row.spec.caveatDe}</p>}
                        <p>
                          <strong>{de.analysis.sourcesLabel}:</strong>
                        </p>
                        <div className="table-scroll" role="region" aria-label={de.analysis.sourcesLabel} tabIndex={0}>
                          <table>
                            <thead>
                              <tr>
                                <th scope="col">{de.analysis.inputColumn}</th>
                                {periodIds.map((periodId) => (
                                  <th scope="col" className="num" key={periodId}>
                                    {periodId}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {inputKeys.map((key) => (
                                <tr key={key}>
                                  <th scope="row">{labelOf(key)}</th>
                                  {periodIds.map((periodId) => {
                                    const year = row.values[periodId];
                                    const input = year?.inputs.find((i) => i.key === key);
                                    const assumed = year?.assumedZero.includes(key) ?? false;
                                    const text =
                                      input?.value === null || input === undefined
                                        ? de.analysis.noValue
                                        : formatByUnit(input.value, factOf(key)?.unit ?? 'EUR');
                                    return (
                                      <td
                                        className="num"
                                        key={periodId}
                                        title={assumed ? de.analysis.assumedZero(labelOf(key)) : undefined}
                                      >
                                        {assumed ? `${text} *` : text}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

import { Fragment, useMemo, useState } from 'react';
import type { SeriesPoint } from '../analysis/types';
import {
  cagr,
  flagOutliers,
  indexSeries,
  OUTLIER_Z_THRESHOLD,
  yoyChanges,
  yoyPercentSeries,
} from '../analysis/timeseries';
import { de } from '../i18n/de';
import {
  formatByUnit,
  formatDecimal1,
  formatSignedRatio,
  unitFormat,
} from '../lib/format';
import { sortedPeriods } from '../lib/dataset';
import type { TrendModel } from '../lib/grouped';
import type { Dataset, Fact } from '../types';
import { TrendChart } from './TrendChart';

/** Chart modes of the time series section. */
type Mode = 'absolute' | 'index' | 'change';

const MODES: { id: Mode; label: string }[] = [
  { id: 'absolute', label: de.analysis.modeAbsolute },
  { id: 'index', label: de.analysis.modeIndex },
  { id: 'change', label: de.analysis.modeChange },
];

const MAX_SERIES = 6;

/** Positions offered in the picker, preferred ones first for the default selection. */
const DEFAULT_KEYS = ['total_assets', 'equity_total', 'revenue', 'net_result'];

const STATEMENTS = new Set(['balance_assets', 'balance_liabilities', 'income']);

interface Props {
  dataset: Dataset;
  /** Period shown in the dashboard; marked in the chart. */
  periodId: string;
}

/**
 * The "Zeitreihen" section: a multi-select of statement positions, a line
 * chart with three display modes (absolute, index, change vs. prior year) and
 * a table with year-over-year change, CAGR and outlier flags.
 */
export function AnalysisTimeSeries({ dataset, periodId }: Props) {
  const periodIds = useMemo(() => sortedPeriods(dataset).map((p) => p.id), [dataset]);
  const groups = useMemo(() => {
    // Only positions that carry at least one figure are worth selecting.
    const valued = dataset.facts.filter(
      (fact) =>
        STATEMENTS.has(fact.statement) &&
        periodIds.some((id) => fact.values[id] !== null && fact.values[id] !== undefined),
    );
    return [
      { labelDe: de.analysis.groupBalance, facts: valued.filter((f) => f.statement !== 'income') },
      { labelDe: de.analysis.groupIncome, facts: valued.filter((f) => f.statement === 'income') },
    ].filter((group) => group.facts.length > 0);
  }, [dataset, periodIds]);
  const available = useMemo(() => groups.flatMap((group) => group.facts), [groups]);

  const [picked, setPicked] = useState<string[] | null>(null);
  const [mode, setMode] = useState<Mode>('absolute');
  const [basePeriodId, setBasePeriodId] = useState<string>('');
  const defaultKeys = useMemo(() => {
    const preferred = DEFAULT_KEYS.filter((key) => available.some((fact) => fact.key === key));
    return preferred.length > 0 ? preferred : available.slice(0, 3).map((fact) => fact.key);
  }, [available]);
  const selectedKeys = picked ?? defaultKeys;

  const toggle = (key: string) => {
    const next = selectedKeys.includes(key)
      ? selectedKeys.filter((k) => k !== key)
      : [...selectedKeys, key];
    if (next.length <= MAX_SERIES) setPicked(next);
  };

  const selectedFacts = available.filter((fact) => selectedKeys.includes(fact.key));
  const base = basePeriodId || periodIds[0] || '';
  const seriesOf = (fact: Fact): SeriesPoint[] =>
    periodIds.map((id) => ({ periodId: id, value: fact.values[id] ?? null }));

  const chartModel = useMemo<TrendModel | null>(() => {
    if (selectedFacts.length === 0) return null;
    const format =
      mode === 'absolute'
        ? unitFormat(selectedFacts[0].unit)
        : mode === 'change'
          ? unitFormat('pct')
          : {
              axisName: de.analysis.axisIndex,
              tick: (v: number) => formatDecimal1(v),
              value: (v: number) => formatDecimal1(v),
            };
    return {
      format,
      categories: periodIds,
      series: selectedFacts.map((fact) => {
        const points = seriesOf(fact);
        let values: (number | null)[];
        if (mode === 'absolute') {
          values = points.map((point) => point.value);
        } else if (mode === 'change') {
          values = yoyPercentSeries(points).map((point) => point.value);
        } else {
          const indexed = indexSeries(points, base);
          values = indexed ? indexed.map((point) => point.value) : points.map(() => null);
        }
        return { key: fact.key, name: fact.labelDe, values };
      }),
    };
  }, [selectedFacts, periodIds, mode, base, dataset]);

  const controls = (
    <>
      <div className="segmented" role="group" aria-label={de.analysis.mode}>
        {MODES.map((option) => (
          <button
            key={option.id}
            type="button"
            className={mode === option.id ? 'segment is-active' : 'segment'}
            aria-pressed={mode === option.id}
            onClick={() => setMode(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {mode === 'index' && (
        <label className="field">
          {de.analysis.baseYear}{' '}
          <select value={base} onChange={(event) => setBasePeriodId(event.target.value)}>
            {periodIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
      )}
      {groups.map((group) => (
        <fieldset className="series-picker" key={group.labelDe}>
          <legend>{group.labelDe}</legend>
          {group.facts.map((fact) => {
            const checked = selectedKeys.includes(fact.key);
            return (
              <label key={fact.key}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && selectedKeys.length >= MAX_SERIES}
                  onChange={() => toggle(fact.key)}
                />{' '}
                {fact.labelDe}
              </label>
            );
          })}
        </fieldset>
      ))}
      {selectedKeys.length >= MAX_SERIES && <p className="muted">{de.analysis.maxSeries}</p>}
    </>
  );

  return (
    <>
      {chartModel ? (
        <TrendChart
          id="analysis-trend"
          title={de.analysis.timeseriesTitle}
          subtitle={de.analysis.timeseriesSubtitle}
          model={chartModel}
          selected={periodId}
          controls={controls}
        />
      ) : (
        <section className="card">
          <h2 className="card-title">{de.analysis.timeseriesTitle}</h2>
          <p className="muted">{de.analysis.noSeries}</p>
          {controls}
        </section>
      )}

      {selectedFacts.length > 0 && (
        <section className="card" aria-labelledby="analysis-ts-table-title">
          <h2 id="analysis-ts-table-title" className="card-title">
            {de.analysis.tableTitle}
          </h2>
          <p className="card-subtitle">{de.analysis.cagrNote}</p>
          <div className="table-scroll" role="region" aria-label={de.analysis.tableTitle} tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">{de.table.position}</th>
                  <th scope="col">{de.analysis.measureColumn}</th>
                  {periodIds.map((id) => (
                    <th scope="col" className="num" key={id}>
                      {id}
                    </th>
                  ))}
                  <th scope="col" className="num">
                    {de.analysis.cagr}
                  </th>
                </tr>
              </thead>
              <tbody>
                {selectedFacts.map((fact) => {
                  const points = seriesOf(fact);
                  const changes = yoyChanges(points);
                  const flags = new Map(flagOutliers(points).map((flag) => [flag.periodId, flag.z]));
                  const rate = cagr(points);
                  return (
                    <Fragment key={fact.key}>
                      <tr>
                        <th scope="row" rowSpan={3}>
                          {fact.labelDe}
                        </th>
                        <th scope="row">{de.analysis.valueRow}</th>
                        {points.map((point) => {
                          const z = flags.get(point.periodId);
                          return (
                            <td
                              className="num"
                              key={point.periodId}
                              title={z === undefined ? undefined : de.analysis.outlierMark(formatDecimal1(Math.abs(z)))}
                            >
                              {point.value === null ? de.analysis.noValue : formatByUnit(point.value, fact.unit)}
                              {z === undefined ? '' : ' ▲'}
                            </td>
                          );
                        })}
                        <td className="num" rowSpan={3}>
                          {rate === null ? de.analysis.na : formatSignedRatio(rate)}
                        </td>
                      </tr>
                      <tr>
                        <th scope="row">{de.analysis.yoyAbs}</th>
                        {changes.map((change) => (
                          <td className="num" key={change.periodId}>
                            {change.abs === null ? de.analysis.noValue : formatByUnit(change.abs, fact.unit)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row">{de.analysis.yoyRel}</th>
                        {changes.map((change) => (
                          <td className="num" key={change.periodId}>
                            {change.rel === null ? de.analysis.noValue : formatSignedRatio(change.rel)}
                          </td>
                        ))}
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted">{de.analysis.outlierRule(OUTLIER_Z_THRESHOLD)}</p>
        </section>
      )}
    </>
  );
}

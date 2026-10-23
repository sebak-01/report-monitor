import { useMemo, useState } from 'react';
import { DataTable, type DataTableRow } from '../components/DataTable';
import { TrendChart } from '../components/TrendChart';
import { ValidationPanel } from '../components/ValidationPanel';
import { de } from '../i18n/de';
import { sortedPeriods } from '../lib/dataset';
import { formatByUnit } from '../lib/format';
import {
  buildGenericCards,
  buildGenericTrend,
  chartableFacts,
  factsOfView,
  MAX_CHART_SERIES,
} from '../lib/genericView';
import { DEFAULT_TOLERANCE } from '../lib/validate';
import { forView, KpiGrid, NoteList, Redactions, type ViewProps } from './common';

const VIEW_ID = 'data';

/** The generic view for uploaded tables: first figures, a chart of chosen items, and the complete table. */
export function DataView({ dataset, periodId, report }: ViewProps) {
  const view = dataset.views.find((v) => v.id === VIEW_ID);
  const facts = useMemo(() => factsOfView(dataset, view?.statements ?? []), [dataset, view]);
  const periods = useMemo(() => sortedPeriods(dataset), [dataset]);
  const cards = useMemo(() => buildGenericCards(facts, dataset, periodId), [facts, dataset, periodId]);
  const chartable = useMemo(() => chartableFacts(facts), [facts]);

  const [picked, setPicked] = useState<string[] | null>(null);
  const selectedKeys =
    picked ?? (chartable ? chartable.facts.slice(0, MAX_CHART_SERIES).map((f) => f.key) : []);
  const selected = chartable ? chartable.facts.filter((f) => selectedKeys.includes(f.key)) : [];
  const trend = useMemo(
    () => (chartable ? buildGenericTrend(dataset, selected, chartable.unit) : null),
    [dataset, chartable, selected],
  );

  const toggle = (key: string) => {
    const next = selectedKeys.includes(key) ? selectedKeys.filter((k) => k !== key) : [...selectedKeys, key];
    if (next.length <= MAX_CHART_SERIES) setPicked(next);
  };

  const rows: DataTableRow[] = facts.map((fact) => ({
    key: fact.key,
    label: fact.labelDe,
    cells: periods.map((p) => formatByUnit(fact.values[p.id] ?? null, fact.unit)),
  }));
  const notes = forView(dataset.notes, VIEW_ID, periodId);
  const redactions = forView(dataset.redactions, VIEW_ID, periodId);

  if (facts.length === 0) return <p className="muted">{de.data.empty}</p>;

  return (
    <>
      {cards.length > 0 && <KpiGrid label={de.data.cardsLabel} cards={cards} />}

      {chartable && (
        <>
          {trend ? (
            <TrendChart
              id="data-trend"
              title={de.data.chartTitle}
              subtitle={de.data.chartSubtitle}
              model={trend}
              selected={periodId}
            />
          ) : (
            <p className="muted">{de.data.noChart}</p>
          )}
          {chartable.facts.length > 1 && (
            <fieldset className="series-picker">
              <legend>{de.data.pickSeries}</legend>
              {chartable.facts.map((fact) => {
                const checked = selectedKeys.includes(fact.key);
                return (
                  <label key={fact.key}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && selectedKeys.length >= MAX_CHART_SERIES}
                      onChange={() => toggle(fact.key)}
                    />{' '}
                    {fact.labelDe}
                  </label>
                );
              })}
              {chartable.facts.length > MAX_CHART_SERIES && selectedKeys.length >= MAX_CHART_SERIES && <p className="muted">{de.data.maxSeries}</p>}
            </fieldset>
          )}
        </>
      )}

      <section className="card" aria-label={de.data.tableTitle}>
        <DataTable
          title={de.data.tableTitle}
          columns={periods.map((p) => p.id)}
          rows={rows}
          labelHeader={de.table.position}
        />
      </section>

      <NoteList title={de.data.notesTitle} notes={notes} />
      <Redactions items={redactions} />
      {report.results.length > 0 && (
        <ValidationPanel
          report={report}
          periods={periods.map((p) => p.id).reverse()}
          tolerance={dataset.conventions.tolerance ?? DEFAULT_TOLERANCE}
        />
      )}
    </>
  );
}

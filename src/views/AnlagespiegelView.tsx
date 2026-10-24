import { useMemo } from 'react';
import { TrendChart } from '../components/TrendChart';
import { ValidationPanel } from '../components/ValidationPanel';
import { de } from '../i18n/de';
import { sortedPeriods } from '../lib/dataset';
import { formatAmount, formatEurMio } from '../lib/format';
import type { TrendModel } from '../lib/grouped';
import { DEFAULT_TOLERANCE } from '../lib/validate';
import type { Schedule, ScheduleColumn, ScheduleRow } from '../types';
import {
  createViewContext,
  forView,
  NoteList,
  Redactions,
  type ViewProps,
} from './common';

const VIEW_ID = 'anlagespiegel';

function groupOf(column: ScheduleColumn): string {
  return column.groupDe ?? de.anlagespiegel.groups.other;
}

/** The fixed asset schedule of one year: columns as printed, rows with hierarchy. */
function ScheduleTable({ schedule, periodId }: { schedule: Schedule; periodId: string }) {
  const groups = useMemo(() => {
    const list: { label: string; columns: ScheduleColumn[] }[] = [];
    for (const column of schedule.columns) {
      const label = groupOf(column);
      const last = list[list.length - 1];
      if (last && last.label === label) last.columns.push(column);
      else list.push({ label, columns: [column] });
    }
    return list;
  }, [schedule.columns]);

  const cell = (row: ScheduleRow, key: string) => {
    const value = row.values[periodId]?.[key];
    return value === undefined || value === null ? '–' : formatAmount(value);
  };

  return (
    <div className="data-table">
      <h4 className="statement-title">{schedule.labelDe}</h4>
      {schedule.sourceDe && <p className="card-subtitle">{schedule.sourceDe}</p>}
      <div className="table-scroll" role="region" aria-label={schedule.labelDe} tabIndex={0}>
        <table>
          <caption className="sr-only">{`${schedule.labelDe} ${periodId}`}</caption>
          <thead>
            <tr>
              <th scope="col" rowSpan={2}>
                {de.table.position}
              </th>
              {groups.map((group) => (
                <th scope="colgroup" className="num" colSpan={group.columns.length} key={group.label}>
                  {group.label}
                </th>
              ))}
            </tr>
            <tr>
              {schedule.columns.map((column) => (
                <th scope="col" className="num" key={column.key}>
                  {column.labelDe}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedule.rows.map((row) => {
              const parent = row.parentKey ? schedule.rows.find((r) => r.key === row.parentKey) : null;
              const depth = parent ? 1 : 0;
              const number = row.numberLabel ?? '';
              const label = number && row.labelDe.startsWith(number) ? row.labelDe.slice(number.length).trim() : row.labelDe;
              return (
                <tr key={row.key} className={row.emphasis === 'total' ? 'row-total' : undefined}>
                  <th scope="row" style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}>
                    {number && <span className="muted">{number} </span>}
                    {label}
                  </th>
                  {schedule.columns.map((column) => (
                    <td className="num" key={column.key}>
                      {cell(row, column.key)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AnlagespiegelView({ dataset, periodId, report }: ViewProps) {
  const ctx = useMemo(() => createViewContext(dataset, periodId), [dataset, periodId]);
  const schedule = dataset.schedules?.[0];
  const periods = useMemo(() => sortedPeriods(dataset), [dataset]);
  const allYears = useMemo(() => periods.map((p) => p.id), [periods]);

  const row = (pattern: RegExp) => schedule?.rows.find((r) => pattern.test(r.labelDe));
  const cellOf = (r: ScheduleRow | undefined, key: string, period: string | null) => {
    if (!r || period === null) return null;
    const value = r.values[period]?.[key];
    return value === undefined ? null : value;
  };

  const totalRow = row(/Summe Anlageverm/i);
  const book = (period: string | null) => cellOf(totalRow, 'book-value', period);

  const trend = useMemo<TrendModel | null>(() => {
    if (!schedule) return null;
    const items = schedule.rows
      .filter((r) => r.emphasis === 'subtotal' || r.emphasis === 'total')
      .filter((r) => allYears.some((y) => cellOf(r, 'book-value', y) !== null))
      .slice(0, 6);
    if (items.length === 0 || allYears.length < 2) return null;
    return {
      categories: allYears,
      series: items.map((r) => ({
        key: r.key,
        name: r.labelDe.replace(/^\S*\s*/, ''),
        values: allYears.map((y) => cellOf(r, 'book-value', y)),
      })),
    };
  }, [schedule, allYears]);

  if (!ctx) return null;
  const { currentId, previousId } = ctx;
  const redactions = forView(dataset.redactions, VIEW_ID, currentId);
  const notes = forView(dataset.notes, VIEW_ID, currentId);

  if (!schedule) {
    return (
      <>
        <p className="muted">{de.anlagespiegel.missing}</p>
        <Redactions items={redactions} />
        <NoteList title={de.anlagespiegel.title} notes={notes} />
      </>
    );
  }

  const tiles: { label: string; value: number | null; previous: number | null }[] = [
    { label: de.anlagespiegel.bookValue, value: book(currentId), previous: book(previousId) },
    {
      label: de.anlagespiegel.additions,
      value: cellOf(totalRow, 'additions', currentId),
      previous: cellOf(totalRow, 'additions', previousId),
    },
    {
      label: de.anlagespiegel.depExpense,
      value: cellOf(totalRow, 'dep-expense', currentId),
      previous: cellOf(totalRow, 'dep-expense', previousId),
    },
  ];

  return (
    <>
      <section className="kpi-grid" aria-label={de.anlagespiegel.tilesLabel}>
        {tiles.map((tile) => (
          <article className="kpi-card" key={tile.label}>
            <h3 className="kpi-label">{tile.label}</h3>
            <p className="kpi-value">{tile.value === null ? '–' : formatEurMio(tile.value)}</p>
            {previousId && tile.previous !== null && (
              <p className="kpi-prior">{`${previousId}: ${formatEurMio(tile.previous)}`}</p>
            )}
          </article>
        ))}
      </section>

      {trend && (
        <TrendChart
          id="anlagespiegel-trend"
          title={de.anlagespiegel.trendTitle}
          subtitle={de.anlagespiegel.trendSubtitle}
          model={trend}
          selected={currentId}
        />
      )}

      <section className="card">
        <ScheduleTable schedule={schedule} periodId={currentId} />
      </section>

      <NoteList title={de.anlagespiegel.title} notes={notes} />
      <Redactions items={redactions} />

      <ValidationPanel
        report={report}
        periods={allYears.slice().reverse()}
        tolerance={dataset.conventions.tolerance ?? DEFAULT_TOLERANCE}
      />
    </>
  );
}

import type { ReactNode } from 'react';
import { de } from '../i18n/de';
import { escapeHtml, formatEur, formatInteger, formatMioTick, formatSignedRatio, formatTeur, relativeChange } from '../lib/format';
import type { GroupedModel } from '../lib/grouped';
import type { ChartType } from './ChartControls';
import { FONT, useEChart, type ChartTokens, type EChartsOption } from './chartTheme';

interface TooltipItem {
  name: string;
  seriesName: string;
  value: number | null;
  marker: string;
}

const BAR_GAP_PX = 2; // surface gap between two bars of a group
const MIN_ROW_HEIGHT = 62;
const ROW_PADDING_PX = 28; // clear space between the bar groups of two items
const CHROME_HEIGHT = 110; // legend above, axis and axis title below
const LINE_HEIGHT = 320;

/**
 * Bars per item and height of one item row in the bar view: the more years are
 * selected, the more bars stand in one row, so the row has to grow. Otherwise
 * the groups overflow into the neighbouring items and overlap them.
 */
export function barLayout(yearCount: number): { barWidth: number; rowHeight: number } {
  const barWidth = yearCount <= 2 ? 14 : yearCount <= 4 ? 11 : yearCount <= 6 ? 9 : 8;
  const groupHeight = yearCount * barWidth + Math.max(0, yearCount - 1) * BAR_GAP_PX;
  return { barWidth, rowHeight: Math.max(MIN_ROW_HEIGHT, groupHeight + ROW_PADDING_PX) };
}

function formatValue(value: number | null, unit: GroupedModel['unit']): string {
  if (value === null) return '–';
  return unit === 'EUR' ? formatEur(value) : formatTeur(value);
}

function formatTick(value: number, unit: GroupedModel['unit']): string {
  return unit === 'EUR' ? formatMioTick(value) : formatInteger(value);
}

/**
 * Year series colors: the familiar pale/strong blue pair for two years, one
 * clearly distinct hue per year from three years on (oldest first).
 */
function yearColors(count: number, tokens: ChartTokens): string[] {
  if (count <= 1) return [tokens.seriesCurrent];
  if (count === 2) return [tokens.seriesPrev, tokens.seriesCurrent];
  return Array.from({ length: count }, (_, i) => tokens.categorical[i % tokens.categorical.length]);
}

function buildOption(model: GroupedModel, type: ChartType, tokens: ChartTokens): EChartsOption {
  const { rows, periods, unit } = model;
  const { barWidth } = barLayout(periods.length);

  const grid = { left: 8, right: 24, bottom: 52, containLabel: true };
  const valueAxis = {
    type: 'value' as const,
    name: unit === 'EUR' ? de.chart.axisMio : de.chart.axisTeur,
    nameTextStyle: { color: tokens.muted, fontFamily: FONT },
    axisLabel: {
      color: tokens.muted,
      fontFamily: FONT,
      formatter: (v: number) => formatTick(v, unit),
    },
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: tokens.grid, width: 1, type: 'solid' } },
  };

  if (type === 'line') {
    // One line per item over the selected years.
    return {
      animation: !tokens.reducedMotion,
      textStyle: { fontFamily: FONT },
      aria: { enabled: true },
      legend: {
        top: 0,
        left: 0,
        icon: 'roundRect',
        itemWidth: 12,
        itemHeight: 8,
        itemGap: 18,
        textStyle: { color: tokens.ink2, fontFamily: FONT },
      },
      grid: { ...grid, top: 44 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: tokens.grid, width: 1, type: 'solid' } },
        backgroundColor: tokens.surface,
        borderColor: tokens.grid,
        textStyle: { color: tokens.ink, fontFamily: FONT },
        formatter: (raw: unknown) => {
          const items = (Array.isArray(raw) ? raw : [raw]) as TooltipItem[];
          const lines = items.map(
            (item) =>
              `${item.marker} ${escapeHtml(item.seriesName)}: <b>${escapeHtml(formatValue(item.value, unit))}</b>`,
          );
          return `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(items[0]?.name ?? '')}</div>${lines.join('<br/>')}`;
        },
      },
      xAxis: {
        type: 'category',
        data: periods,
        boundaryGap: false,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: tokens.axis, width: 1 } },
        axisLabel: { color: tokens.muted, fontFamily: FONT },
      },
      yAxis: { ...valueAxis, nameLocation: 'end', nameTextStyle: { color: tokens.muted, fontFamily: FONT, align: 'left' } },
      series: rows.map((row, index) => ({
        name: row.label,
        type: 'line',
        data: row.values,
        color: tokens.categorical[index % tokens.categorical.length],
        lineStyle: { width: 2 },
        symbol: 'circle',
        symbolSize: 6,
        connectNulls: false,
      })),
    };
  }

  // One bar per year for each item.
  const rowByLabel = new Map(rows.map((r) => [r.label, r]));
  const colors = yearColors(periods.length, tokens);
  return {
    animation: !tokens.reducedMotion,
    textStyle: { fontFamily: FONT },
    aria: { enabled: true },
    legend: {
      top: 0,
      left: 0,
      icon: 'roundRect',
      itemWidth: 12,
      itemHeight: 8,
      itemGap: 18,
      textStyle: { color: tokens.ink2, fontFamily: FONT },
    },
    grid: { ...grid, top: 40 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: tokens.grid, opacity: 0.35 } },
      backgroundColor: tokens.surface,
      borderColor: tokens.grid,
      textStyle: { color: tokens.ink, fontFamily: FONT },
      formatter: (raw: unknown) => {
        const items = (Array.isArray(raw) ? raw : [raw]) as TooltipItem[];
        const name = items[0]?.name ?? '';
        const row = rowByLabel.get(name);
        const lines = items.map(
          (item) =>
            `${item.marker} ${escapeHtml(item.seriesName)}: <b>${escapeHtml(formatValue(item.value, unit))}</b>`,
        );
        if (row && periods.length === 2) {
          const change = relativeChange(row.values[1], row.values[0]);
          if (change !== null) {
            lines.push(`${escapeHtml(de.chart.change)}: <b>${escapeHtml(formatSignedRatio(change))}</b>`);
          }
        }
        return `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(name)}</div>${lines.join('<br/>')}`;
      },
    },
    xAxis: { ...valueAxis, nameLocation: 'middle', nameGap: 32 },
    yAxis: {
      type: 'category',
      inverse: true,
      data: rows.map((r) => r.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: tokens.axis, width: 1 } },
      axisLabel: {
        color: tokens.ink2,
        fontFamily: FONT,
        fontSize: 12,
        width: 150,
        overflow: 'break',
        lineHeight: 16,
      },
    },
    series: periods.map((period, i) => ({
      name: period,
      type: 'bar',
      barWidth,
      barGap: `${Math.round((BAR_GAP_PX / barWidth) * 100)}%`,
      barCategoryGap: '55%',
      // Rounded at the data end only; square at the baseline.
      itemStyle: { color: colors[i], borderRadius: [0, 4, 4, 0] },
      data: rows.map((r) => r.values[i]),
    })),
  };
}

interface Props {
  /** Unique within the page; links the heading to the chart. */
  id: string;
  title: string;
  subtitle?: string;
  model: GroupedModel;
  type: ChartType;
  /** Year slider and bar/line switch, see ChartControls. */
  controls?: ReactNode;
}

/** Items compared across the selected years as bars or lines, plus an accessible table. */
export function GroupedBarChart({ id, title, subtitle, model, type, controls }: Props) {
  const containerRef = useEChart((tokens) => buildOption(model, type, tokens), [model, type]);
  const { rowHeight } = barLayout(model.periods.length);
  const height = type === 'line' ? LINE_HEIGHT : model.rows.length * rowHeight + CHROME_HEIGHT;
  const newestFirst = [...model.periods.keys()].reverse();
  const showChange = model.periods.length === 2;

  return (
    <section className="card" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="card-title">
        {title}
      </h3>
      {subtitle && <p className="card-subtitle">{subtitle}</p>}
      {controls}
      <div
        ref={containerRef}
        className="chart"
        style={{ height }}
        role="img"
        aria-label={de.chart.ariaLabel(title)}
      />
      <details className="table-view">
        <summary>{de.chart.tableToggle}</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">{de.chart.tableItem}</th>
                {newestFirst.map((i) => (
                  <th scope="col" className="num" key={model.periods[i]}>
                    {model.periods[i]}
                  </th>
                ))}
                {showChange && <th scope="col" className="num">{de.chart.tableChange}</th>}
              </tr>
            </thead>
            <tbody>
              {model.rows.map((row) => {
                const change = showChange ? relativeChange(row.values[1], row.values[0]) : null;
                return (
                  <tr key={row.key}>
                    <th scope="row">{row.label}</th>
                    {newestFirst.map((i) => (
                      <td className="num" key={model.periods[i]}>
                        {formatValue(row.values[i], model.unit)}
                      </td>
                    ))}
                    {showChange && <td className="num">{change === null ? '–' : formatSignedRatio(change)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

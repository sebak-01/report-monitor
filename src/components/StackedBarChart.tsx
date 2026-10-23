import type { ReactNode } from 'react';
import { de } from '../i18n/de';
import { escapeHtml, formatEur, formatEurMio, formatMioTick, formatRatio } from '../lib/format';
import type { StackedModel } from '../lib/grouped';
import type { ChartType } from './ChartControls';
import { FONT, useEChart, type ChartTokens, type EChartsOption } from './chartTheme';

interface TooltipItem {
  axisValueLabel: string;
  seriesName: string;
  value: number | null;
  marker: string;
}

const BAR_WIDTH = 22; // at most 24 px
const MIN_CHART_HEIGHT = 220;
const LINE_HEIGHT = 320;

function totals(model: StackedModel): number[] {
  return model.categories.map((_, i) =>
    model.series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0),
  );
}

function buildOption(model: StackedModel, type: ChartType, tokens: ChartTokens): EChartsOption {
  const sums = totals(model);
  const lastIndex = model.series.length - 1;

  const tooltip = {
    trigger: 'axis' as const,
    axisPointer: type === 'line' ? { type: 'line' as const, lineStyle: { color: tokens.grid, width: 1, type: 'solid' as const } } : { type: 'none' as const },
    backgroundColor: tokens.surface,
    borderColor: tokens.grid,
    textStyle: { color: tokens.ink, fontFamily: FONT },
    formatter: (raw: unknown) => {
      const items = (Array.isArray(raw) ? raw : [raw]) as TooltipItem[];
      const category = items[0]?.axisValueLabel ?? '';
      const categoryIndex = model.categories.indexOf(category);
      const sum = sums[categoryIndex] ?? 0;
      const lines = items.map((item) => {
        const share = item.value !== null && sum > 0 ? ` (${formatRatio(item.value / sum)})` : '';
        return `${item.marker} ${escapeHtml(item.seriesName)}: <b>${
          item.value === null ? '–' : escapeHtml(formatEur(item.value))
        }</b>${escapeHtml(share)}`;
      });
      lines.push(`${escapeHtml(de.chart.total)}: <b>${escapeHtml(formatEur(sum))}</b>`);
      return `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(category)}</div>${lines.join('<br/>')}`;
    },
  };

  const valueAxis = {
    type: 'value' as const,
    axisLabel: { color: tokens.muted, fontFamily: FONT, formatter: (v: number) => formatMioTick(v) },
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: tokens.grid, width: 1, type: 'solid' } },
  };

  if (type === 'line') {
    // One line per part of the whole, over the selected years (not stacked).
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
      grid: { left: 8, right: 24, top: 44, bottom: 40, containLabel: true },
      tooltip,
      xAxis: {
        type: 'category',
        data: model.categories,
        boundaryGap: false,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: tokens.axis, width: 1 } },
        axisLabel: { color: tokens.muted, fontFamily: FONT },
      },
      yAxis: { ...valueAxis, nameLocation: 'end', nameTextStyle: { color: tokens.muted, fontFamily: FONT, align: 'left' } },
      series: model.series.map((s, index) => ({
        name: s.name,
        type: 'line',
        data: s.values,
        color: tokens.categorical[index % tokens.categorical.length],
        lineStyle: { width: 2 },
        symbol: 'circle',
        symbolSize: 6,
        connectNulls: false,
      })),
    };
  }

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
    grid: { left: 8, right: 96, top: 64, bottom: 36, containLabel: true },
    tooltip,
    xAxis: valueAxis,
    yAxis: {
      type: 'category',
      inverse: true,
      data: model.categories,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: tokens.axis, width: 1 } },
      axisLabel: { color: tokens.ink2, fontFamily: FONT, fontSize: 12 },
    },
    series: model.series.map((s, index) => {
      const isLast = index === lastIndex;
      return {
        name: s.name,
        type: 'bar',
        stack: 'total',
        barWidth: BAR_WIDTH,
        data: s.values,
        // A surface-colored stroke leaves a 2 px gap between touching segments;
        // only the outer end of the stack is rounded.
        itemStyle: {
          color: tokens.categorical[index % tokens.categorical.length],
          borderColor: tokens.surface,
          borderWidth: 1,
          borderRadius: isLast ? [0, 4, 4, 0] : 0,
        },
        // The total at the end of each bar is the one direct label.
        label: isLast
          ? {
              show: true,
              position: 'right',
              color: tokens.ink2,
              fontFamily: FONT,
              fontSize: 12,
              formatter: (p: { dataIndex: number }) => formatEurMio(sums[p.dataIndex] ?? 0),
            }
          : { show: false },
      };
    }),
  };
}

interface Props {
  id: string;
  title: string;
  subtitle?: string;
  model: StackedModel;
  type: ChartType;
  /** Year slider and bar/line switch, see ChartControls. */
  controls?: ReactNode;
}

/** Parts of a whole across the selected years as stacked bars or lines, plus an accessible table. */
export function StackedBarChart({ id, title, subtitle, model, type, controls }: Props) {
  const containerRef = useEChart((tokens) => buildOption(model, type, tokens), [model, type]);
  const sums = totals(model);
  const newestFirst = [...model.categories.keys()].reverse();
  const height =
    type === 'line' ? LINE_HEIGHT : Math.max(MIN_CHART_HEIGHT, model.categories.length * 36 + 96);

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
                  <th scope="col" className="num" key={model.categories[i]}>
                    {model.categories[i]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.series.map((s) => (
                <tr key={s.key}>
                  <th scope="row">{s.name}</th>
                  {newestFirst.map((i) => {
                    const value = s.values[i];
                    const share = value !== null && sums[i] > 0 ? ` (${formatRatio(value / sums[i])})` : '';
                    return (
                      <td className="num" key={i}>
                        {value === null ? '–' : `${formatEur(value)}${share}`}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="row-total">
                <th scope="row">{de.chart.total}</th>
                {newestFirst.map((i) => (
                  <td className="num" key={i}>
                    {formatEur(sums[i])}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

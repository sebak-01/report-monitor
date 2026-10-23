import { de } from '../i18n/de';
import { escapeHtml, formatEur, formatMioTick } from '../lib/format';
import type { TrendModel } from '../lib/grouped';
import { FONT, useEChart, type ChartTokens, type EChartsOption } from './chartTheme';

interface TooltipItem {
  name: string;
  seriesName: string;
  value: number | null;
  marker: string;
}

function buildOption(model: TrendModel, selected: string, tokens: ChartTokens): EChartsOption {
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
    grid: { left: 8, right: 24, top: 44, bottom: 44, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: tokens.surface,
      borderColor: tokens.grid,
      textStyle: { color: tokens.ink, fontFamily: FONT },
      formatter: (raw: unknown) => {
        const items = (Array.isArray(raw) ? raw : [raw]) as TooltipItem[];
        const lines = items.map(
          (item) =>
            `${item.marker} ${escapeHtml(item.seriesName)}: <b>${escapeHtml(item.value === null ? '–' : (model.format?.value ?? formatEur)(item.value))}</b>`,
        );
        return `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(items[0]?.name ?? '')}</div>${lines.join('<br/>')}`;
      },
    },
    xAxis: {
      type: 'category',
      data: model.categories,
      boundaryGap: false,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: tokens.axis, width: 1 } },
      axisLabel: { color: tokens.muted, fontFamily: FONT },
    },
    yAxis: {
      type: 'value',
      name: model.format?.axisName ?? de.chart.axisMio,
      nameLocation: 'end',
      nameTextStyle: { color: tokens.muted, fontFamily: FONT, align: 'left' },
      axisLabel: { color: tokens.muted, fontFamily: FONT, formatter: (v: number) => (model.format?.tick ?? formatMioTick)(v) },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: tokens.grid, width: 1, type: 'solid' } },
    },
    series: model.series.map((series, index) => ({
      name: series.name,
      type: 'line',
      data: series.values,
      color: tokens.categorical[index % tokens.categorical.length],
      lineStyle: { width: 2 },
      symbol: 'circle',
      symbolSize: 6,
      connectNulls: false,
      markLine:
        index === 0
          ? {
              silent: true,
              symbol: 'none',
              label: { show: false },
              lineStyle: { color: tokens.axis, type: 'dashed', width: 1 },
              data: [{ xAxis: selected }],
            }
          : undefined,
    })),
  };
}

interface Props {
  id: string;
  title?: string;
  subtitle?: string;
  model: TrendModel;
  /** Period shown in the dashboard; marked in the chart. */
  selected: string;
}

/** Lines over all years, with the selected year marked, plus an accessible table. */
export function TrendChart({ id, title = de.chart.trendTitle, subtitle = de.chart.trendSubtitle, model, selected }: Props) {
  const containerRef = useEChart((tokens) => buildOption(model, selected, tokens), [model, selected]);

  return (
    <section className="card" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="card-title">
        {title}
      </h3>
      {subtitle && <p className="card-subtitle">{subtitle}</p>}
      <div
        ref={containerRef}
        className="chart"
        style={{ height: 320 }}
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
                {model.categories.map((category) => (
                  <th scope="col" className="num" key={category}>
                    {category}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.series.map((series) => (
                <tr key={series.key}>
                  <th scope="row">{series.name}</th>
                  {series.values.map((value, i) => (
                    <td className="num" key={model.categories[i]}>
                      {value === null ? '–' : (model.format?.value ?? formatEur)(value)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

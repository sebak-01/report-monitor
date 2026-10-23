import { BarChart, LineChart } from 'echarts/charts';
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef, useState, type DependencyList, type RefObject } from 'react';

echarts.use([
  BarChart,
  LineChart,
  AriaComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer,
]);

export type EChartsOption = echarts.EChartsCoreOption;

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export interface ChartTokens {
  surface: string;
  ink: string;
  ink2: string;
  muted: string;
  grid: string;
  axis: string;
  seriesPrev: string;
  seriesCurrent: string;
  /** Categorical colors in their fixed order (slot 1 first), enough for every period. */
  categorical: string[];
  reducedMotion: boolean;
}

/** Chart colors come from the CSS custom properties, so light/dark stays in one place. */
export function readTokens(el: HTMLElement): ChartTokens {
  const style = getComputedStyle(el);
  const get = (name: string) => style.getPropertyValue(name).trim();
  return {
    surface: get('--surface-1'),
    ink: get('--text-primary'),
    ink2: get('--text-secondary'),
    muted: get('--text-muted'),
    grid: get('--grid'),
    axis: get('--axis'),
    seriesPrev: get('--series-prev'),
    seriesCurrent: get('--series-current'),
    categorical: [1, 2, 3, 4, 5, 6, 7].map((n) => get(`--cat-${n}`)),
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

/** Bumps whenever the theme changes (OS setting or a data-theme attribute). */
function useThemeTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', bump);
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      media.removeEventListener('change', bump);
      observer.disconnect();
    };
  }, []);
  return tick;
}

/**
 * Creates one ECharts instance for the returned container ref, keeps it sized
 * to its container and re-renders it when `deps` or the theme change.
 */
export function useEChart(
  build: (tokens: ChartTokens) => EChartsOption,
  deps: DependencyList,
): RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const themeTick = useThemeTick();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = echarts.init(el);
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    const chart = chartRef.current;
    if (!el || !chart) return;
    chart.setOption(build(readTokens(el)), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, themeTick]);

  return containerRef;
}

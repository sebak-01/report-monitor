import { useId } from 'react';
import { de } from '../i18n/de';
import type { YearRange } from './useChartYears';

export type ChartType = 'bar' | 'line';

interface Props {
  /** All selectable periods, oldest first. */
  periods: string[];
  range: YearRange;
  onRangeChange: (range: YearRange) => void;
  type: ChartType;
  onTypeChange: (type: ChartType) => void;
  /** Hide the bar/line toggle for tables that have no chart variant. */
  showType?: boolean;
}

/**
 * Chart toolbar: a dual-handle slider for the years to show ("von" – "bis") and
 * a segmented switch between bar and line charts. Two range inputs are laid on
 * top of each other, which keeps both handles keyboard- and screen-reader
 * accessible.
 */
export function ChartControls({ periods, range, onRangeChange, type, onTypeChange, showType = true }: Props) {
  const sliderId = useId();
  const last = Math.max(0, periods.length - 1);
  const from = Math.min(Math.max(range.from, 0), last);
  const to = Math.min(Math.max(range.to, from), last);
  const label = (index: number) => periods[index] ?? '';

  return (
    <div className="chart-toolbar">
      <div className="range-dual" role="group" aria-label={de.chart.controls.years}>
        <span className="range-caption">{de.chart.controls.from}</span>
        {/* When both handles sit on the same year, CSS pushes their thumbs apart
            (`data-same`) so each one stays grabbable and they can be separated. */}
        <div className="range-track" data-same={from === to ? 'true' : undefined}>
          <input
            id={`${sliderId}-from`}
            type="range"
            min={0}
            max={last}
            value={from}
            aria-label={de.chart.controls.from}
            aria-valuetext={label(from)}
            onChange={(e) => onRangeChange({ from: Math.min(Number(e.target.value), to), to })}
          />
          <input
            id={`${sliderId}-to`}
            type="range"
            min={0}
            max={last}
            value={to}
            aria-label={de.chart.controls.to}
            aria-valuetext={label(to)}
            onChange={(e) => onRangeChange({ from, to: Math.max(Number(e.target.value), from) })}
          />
        </div>
        <span className="range-caption">{de.chart.controls.to}</span>
        <output className="range-value" htmlFor={`${sliderId}-from ${sliderId}-to`}>
          {from === to ? label(from) : `${label(from)} – ${label(to)}`}
        </output>
      </div>
      {showType && (
        <div className="segmented" role="group" aria-label={de.chart.controls.type}>
          {(['bar', 'line'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={type === option ? 'segment is-active' : 'segment'}
              aria-pressed={type === option}
              onClick={() => onTypeChange(option)}
            >
              {option === 'bar' ? de.chart.controls.bar : de.chart.controls.line}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

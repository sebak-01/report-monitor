import { useMemo, useState } from 'react';

export interface YearRange {
  /** Inclusive index bounds into the period list (oldest first). */
  from: number;
  to: number;
}

export interface ChartYears {
  /** The selected period ids, oldest first. */
  years: string[];
  range: YearRange;
  setRange: (range: YearRange) => void;
}

/**
 * Which years a chart shows. Defaults to the two latest periods (the previous
 * comparison), so a chart starts out exactly as it did before the slider.
 */
export function useChartYears(periods: string[]): ChartYears {
  const [range, setRange] = useState<YearRange>(() => ({
    from: Math.max(0, periods.length - 2),
    to: Math.max(0, periods.length - 1),
  }));
  const last = Math.max(0, periods.length - 1);
  const from = Math.min(Math.max(range.from, 0), last);
  const to = Math.min(Math.max(range.to, from), last);
  const years = useMemo(() => periods.slice(from, to + 1), [periods, from, to]);
  return {
    years,
    range: { from, to },
    setRange: (next) => setRange({ from: Math.min(Math.max(next.from, 0), last), to: Math.min(Math.max(next.to, 0), last) }),
  };
}

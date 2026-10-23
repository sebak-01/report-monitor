import { describe, expect, it } from 'vitest';
import { barLayout } from './GroupedBarChart';

describe('barLayout', () => {
  it('keeps the familiar layout for one or two years', () => {
    expect(barLayout(1)).toEqual({ barWidth: 14, rowHeight: 62 });
    expect(barLayout(2)).toEqual({ barWidth: 14, rowHeight: 62 });
  });

  it('grows the row with every year so bar groups cannot overlap', () => {
    for (let years = 1; years <= 8; years++) {
      const { barWidth, rowHeight } = barLayout(years);
      const groupHeight = years * barWidth + Math.max(0, years - 1) * 2;
      expect(rowHeight, `${years} years`).toBeGreaterThan(groupHeight);
    }
  });

  it('reserves the same clear space between the groups from three years on', () => {
    for (let years = 3; years <= 8; years++) {
      const { barWidth, rowHeight } = barLayout(years);
      const groupHeight = years * barWidth + (years - 1) * 2;
      expect(rowHeight - groupHeight, `${years} years`).toBe(28);
    }
  });

  it('thins the bars out as more years join in', () => {
    let previous = Infinity;
    for (let years = 1; years <= 8; years++) {
      const { barWidth } = barLayout(years);
      expect(barWidth).toBeLessThanOrEqual(previous);
      previous = barWidth;
    }
  });
});

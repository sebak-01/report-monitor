import type { Dataset, Fact, Unit } from '../types';
import type { KpiCardModel } from './kpiCards';
import { sortedPeriods, previousPeriodId } from './dataset';
import { formatByUnit, formatSignedRatio, relativeChange, unitFormat } from './format';
import type { TrendModel } from './grouped';

/** Facts of the statements a view shows, in dataset order. */
export function factsOfView(dataset: Dataset, statements: string[]): Fact[] {
  return dataset.facts.filter((f) => statements.includes(f.statement));
}

/** Headline cards for the first facts of an uploaded table: value in the selected year and change to the year before. */
export function buildGenericCards(facts: Fact[], dataset: Dataset, periodId: string, limit = 4): KpiCardModel[] {
  const previousId = previousPeriodId(dataset, periodId);
  const valued = facts.filter((f) => f.values[periodId] !== null && f.values[periodId] !== undefined);
  // The empty start view: the boxes show, but every figure reads "–".
  const chosen = (valued.length > 0 ? valued : facts).slice(0, limit);
  return chosen.map((fact) => {
      const current = fact.values[periodId] ?? null;
      const previous = previousId === null ? null : (fact.values[previousId] ?? null);
      const change = current === null ? null : relativeChange(current, previous);
      return {
        id: fact.key,
        label: fact.labelDe,
        value: formatByUnit(current, fact.unit),
        exact: null,
        detail: null,
        prior: previousId !== null ? `${previousId}: ${previous === null ? '–' : formatByUnit(previous, fact.unit)}` : null,
        delta:
          change === null
            ? null
            : {
                text: `${formatSignedRatio(change)} ggü. ${previousId}`,
                direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
                tone: 'neutral',
              },
      };
    });
}

/** Facts that can share one chart axis: those with the unit of the first selected fact. */
export function chartableFacts(facts: Fact[]): { unit: Unit; facts: Fact[] } | null {
  if (facts.length === 0) return null;
  const unit = facts[0].unit;
  return { unit, facts: facts.filter((f) => f.unit === unit) };
}

export const MAX_CHART_SERIES = 4;

export function buildGenericTrend(dataset: Dataset, facts: Fact[], unit: Unit): TrendModel | null {
  const periods = sortedPeriods(dataset);
  if (periods.length < 2 || facts.length === 0) return null;
  return {
    format: unitFormat(unit),
    categories: periods.map((p) => p.id),
    series: facts.map((fact) => ({
      key: fact.key,
      name: fact.labelDe,
      values: periods.map((p) => fact.values[p.id] ?? null),
    })),
  };
}

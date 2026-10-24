import { de } from '../i18n/de';
import type { Dataset } from '../types';
import {
  createLookup,
  latestPeriodId,
  previousPeriodId,
  type ValueLookup,
} from './dataset';
import { ExpressionError, parseExpression } from './expression';
import { evaluateInPeriod } from './formula';
import {
  formatByUnit,
  formatEur,
  formatEurMio,
  formatEurRounded,
  formatInteger,
  formatPercentagePoints,
  formatRatio,
  formatSignedInteger,
  formatSignedRatio,
} from './format';

export type Direction = 'up' | 'down' | 'flat';
export type Tone = 'good' | 'bad' | 'neutral';

export interface KpiCardModel {
  id: string;
  label: string;
  /** Headline value, compact (e.g. "2,07 Mio. €"). */
  value: string;
  /** Exact value for amounts (e.g. "2.074.189,84 €"), otherwise null. */
  exact: string | null;
  /** An extra figure under the headline, e.g. "Personalaufwand je Beschäftigten: 69.732 €". */
  detail: string | null;
  /** Value of the previous period, e.g. "2023: 1,77 Mio. €". */
  prior: string | null;
  delta: { text: string; direction: Direction; tone: Tone } | null;
}

type Source =
  | { kind: 'fact'; key: string; negate?: boolean }
  | { kind: 'derived'; key: string }
  /** A formula over facts (e.g. a ratio), evaluated without a dataset DerivedKpi. */
  | { kind: 'expr'; formula: string };

interface KpiSpec {
  id: string;
  label: string;
  source: Source;
  display: 'eurMio' | 'ratio' | 'count';
  /** Which direction of change is an improvement. */
  goodWhen: 'up' | 'down' | 'neutral';
  delta: 'relative' | 'points' | 'absolute';
  /** Optional second figure, taken from a derived KPI and shown in whole euros. */
  detail?: { label: string; derivedKey: string };
}

/**
 * Headline KPIs per view. A loss is shown as a positive amount (the economic
 * result is negative), so a decrease of the loss is an improvement.
 */
const SPECS: Record<string, KpiSpec[]> = {
  balance: [
    {
      id: 'total-assets',
      label: de.kpi.totalAssets,
      source: { kind: 'fact', key: 'total_assets' },
      display: 'eurMio',
      goodWhen: 'neutral',
      delta: 'relative',
    },
    {
      id: 'fixed-assets',
      label: de.kpi.fixedAssets,
      source: { kind: 'fact', key: 'fixed_assets_total' },
      display: 'eurMio',
      goodWhen: 'neutral',
      delta: 'relative',
    },
    {
      id: 'equity-ratio',
      label: de.kpi.equityRatio,
      source: { kind: 'derived', key: 'equity_ratio' },
      display: 'ratio',
      goodWhen: 'up',
      delta: 'points',
    },
    {
      id: 'cash',
      label: de.kpi.cash,
      source: { kind: 'fact', key: 'cash' },
      display: 'eurMio',
      goodWhen: 'up',
      delta: 'relative',
    },
  ],
  income: [
    {
      id: 'revenue',
      label: de.kpi.revenue,
      source: { kind: 'fact', key: 'revenue' },
      display: 'eurMio',
      goodWhen: 'up',
      delta: 'relative',
    },
    {
      id: 'net-loss',
      label: de.kpi.netLoss,
      source: { kind: 'fact', key: 'net_result', negate: true },
      display: 'eurMio',
      goodWhen: 'down',
      delta: 'relative',
    },
    {
      id: 'personnel',
      label: de.kpi.personnel,
      source: { kind: 'fact', key: 'personnel_expenses_total' },
      display: 'eurMio',
      goodWhen: 'neutral',
      delta: 'relative',
    },
    {
      id: 'personnel-ratio',
      label: de.kpi.personnelRatio,
      source: { kind: 'expr', formula: 'personnel_expenses_total / revenue' },
      display: 'ratio',
      goodWhen: 'down',
      delta: 'points',
    },
  ],
};

function derivedValue(
  dataset: Dataset,
  lookup: ValueLookup,
  key: string,
  periodId: string,
  previousId: string | null,
): number | null {
  const kpi = dataset.derivedKpis.find((k) => k.key === key);
  if (!kpi) return null;
  try {
    const outcome = evaluateInPeriod(parseExpression(kpi.formula), lookup, periodId, previousId);
    return outcome.ok ? outcome.value : null;
  } catch (error) {
    if (error instanceof ExpressionError) return null;
    throw error;
  }
}

function metricValue(
  dataset: Dataset,
  lookup: ValueLookup,
  source: Source,
  periodId: string,
  previousId: string | null,
): number | null {
  if (source.kind === 'fact') {
    const value = lookup(source.key, periodId);
    if (value === null || value === undefined) return null;
    return source.negate ? -value : value;
  }
  if (source.kind === 'derived') return derivedValue(dataset, lookup, source.key, periodId, previousId);
  try {
    const outcome = evaluateInPeriod(parseExpression(source.formula), lookup, periodId, previousId);
    return outcome.ok ? outcome.value : null;
  } catch (error) {
    if (error instanceof ExpressionError) return null;
    throw error;
  }
}

function formatValue(spec: KpiSpec, value: number): string {
  switch (spec.display) {
    case 'eurMio':
      return formatEurMio(value);
    case 'ratio':
      return formatRatio(value);
    case 'count':
      return formatInteger(value);
  }
}

function toneFor(goodWhen: KpiSpec['goodWhen'], direction: Direction): Tone {
  if (direction === 'flat' || goodWhen === 'neutral') return 'neutral';
  return (direction === 'up') === (goodWhen === 'up') ? 'good' : 'bad';
}

function buildDelta(
  spec: KpiSpec,
  value: number,
  prior: number | null,
  previousLabel: string | null,
): KpiCardModel['delta'] {
  if (prior === null || previousLabel === null) return null;

  let direction: Direction;
  let text: string;

  switch (spec.delta) {
    case 'relative': {
      if (prior === 0) return null;
      const rel = (value - prior) / Math.abs(prior);
      direction = Math.round(rel * 1000) === 0 ? 'flat' : rel > 0 ? 'up' : 'down';
      text =
        direction === 'flat'
          ? de.kpi.unchanged(previousLabel)
          : `${formatSignedRatio(rel)} ${de.kpi.vsPrevious(previousLabel)}`;
      break;
    }
    case 'points': {
      const diff = value - prior;
      direction = Math.round(diff * 1000) === 0 ? 'flat' : diff > 0 ? 'up' : 'down';
      text =
        direction === 'flat'
          ? de.kpi.unchanged(previousLabel)
          : `${formatPercentagePoints(diff)} ${de.kpi.vsPrevious(previousLabel)}`;
      break;
    }
    case 'absolute': {
      const diff = value - prior;
      direction = diff === 0 ? 'flat' : diff > 0 ? 'up' : 'down';
      text =
        direction === 'flat'
          ? de.kpi.unchanged(previousLabel)
          : `${formatSignedInteger(diff)} ${de.kpi.vsPrevious(previousLabel)}`;
      break;
    }
  }

  return { text, direction, tone: toneFor(spec.goodWhen, direction) };
}

/** Builds the headline KPI cards of one view for the selected (default: latest) period, compared to the one before. */
export function buildKpiCards(dataset: Dataset, viewId: string, selected?: string): KpiCardModel[] {
  const periodId = selected ?? latestPeriodId(dataset);
  if (periodId === null) return [];
  const previousId = previousPeriodId(dataset, periodId);
  const lookup = createLookup(dataset);

  const cards: KpiCardModel[] = [];
  for (const spec of SPECS[viewId] ?? []) {
    const value = metricValue(dataset, lookup, spec.source, periodId, previousId);
    if (value === null) continue;
    const prior =
      previousId === null
        ? null
        : metricValue(dataset, lookup, spec.source, previousId, previousPeriodId(dataset, previousId));

    let detail: string | null = null;
    if (spec.detail) {
      const extra = derivedValue(dataset, lookup, spec.detail.derivedKey, periodId, previousId);
      if (extra !== null) detail = `${spec.detail.label}: ${formatEurRounded(extra)}`;
    }

    cards.push({
      id: spec.id,
      label: spec.label,
      value: formatValue(spec, value),
      exact: spec.display === 'eurMio' ? formatEur(value) : null,
      detail,
      prior: prior !== null && previousId !== null ? `${previousId}: ${formatValue(spec, prior)}` : null,
      delta: buildDelta(spec, value, prior, previousId),
    });
  }
  // A dataset without the expected keys (another company) falls back to its own
  // first figures, so the view still shows something.
  if (cards.length === 0) return genericCards(dataset, viewId, periodId, previousId);
  return cards;
}

/** Headline cards from the first printed figures of the view's own statements. */
function genericCards(
  dataset: Dataset,
  viewId: string,
  periodId: string,
  previousId: string | null,
): KpiCardModel[] {
  const view = dataset.views.find((v) => v.id === viewId);
  const statements = view?.statements ?? [];
  const facts = dataset.facts.filter((f) => statements.includes(f.statement) && f.values[periodId] != null);
  return facts.slice(0, 4).map((fact) => {
    const value = fact.values[periodId] as number;
    const prior = previousId === null ? null : (fact.values[previousId] ?? null);
    return {
      id: fact.key,
      label: fact.labelDe,
      value: formatByUnit(value, fact.unit),
      exact: fact.unit === 'EUR' ? formatEur(value) : null,
      detail: null,
      prior: prior !== null && previousId !== null ? `${previousId}: ${formatByUnit(prior, fact.unit)}` : null,
      delta: null,
    };
  });
}

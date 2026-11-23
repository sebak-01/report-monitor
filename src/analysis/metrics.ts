/**
 * Key figures (Kennzahlen) per year, computed from raw line items.
 *
 * Every metric is a ratio of two linear combinations of fact values. A
 * derivation whose required inputs are not all available for a year is n/a
 * (never silently zero); optional additive components count as 0 and are
 * disclosed via `assumedZero` (see `FormulaPart.optional`).
 */

import type {
  AnalysisLookup,
  FormulaInput,
  FormulaPart,
  MetricId,
  MetricRow,
  MetricSpec,
  MetricYearValue,
  RatioFormula,
} from './types';

/**
 * Short-term debt proxy: total debt minus pension provisions. The dataset
 * carries no maturity structure for provisions and liabilities, so the
 * long-term part of the debt is not derivable; pension provisions are the one
 * reliably long-term position and are excluded.
 */
const SHORT_TERM_DEBT: FormulaPart[] = [
  { key: 'total_assets', sign: 1 },
  { key: 'equity_total', sign: -1 },
  { key: 'pension_provisions', sign: -1, optional: true },
];

const SHORT_TERM_DEBT_DE =
  'Kurzfristiges Fremdkapital = Bilanzsumme − Eigenkapital − Pensionsrückstellungen ' +
  '(Näherung: Angaben zur Fristigkeit der Verbindlichkeiten und Rückstellungen liegen nicht vor).';

/**
 * Margin denominators: the Gesamtleistung as printed, the Umsatzerlöse as the
 * fallback base (smaller statements often omit a Gesamtleistung line).
 */
const MARGIN_BASES: FormulaPart[][] = [
  [{ key: 'total_performance', sign: 1 }],
  [{ key: 'revenue', sign: 1 }],
];

const MARGIN_BASE_DE =
  'Fehlt die Gesamtleistung, dient der Umsatzerlöse als Bezugsgröße (in den ' +
  'Berechnungsdetails je Jahr ausgewiesen).';

/** Every numerator derivation with every margin base, preferred combination first. */
function marginForms(numerators: FormulaPart[][]): RatioFormula[] {
  return numerators.flatMap((numerator) =>
    MARGIN_BASES.map((denominator) => ({ numerator, denominator })),
  );
}

/** EBIT: printed operating result, else unwound from the GuV chain, else interest-based. */
const EBIT_NUMERATORS: FormulaPart[][] = [
  [{ key: 'operating_result', sign: 1 }],
  [
    { key: 'result_after_taxes', sign: 1 },
    { key: 'income_taxes', sign: 1 },
    { key: 'financial_result', sign: -1 },
  ],
  [
    { key: 'net_result', sign: 1 },
    { key: 'interest_expense', sign: 1, optional: true },
    { key: 'interest_income', sign: -1, optional: true },
  ],
];

/** The metrics of the "Kennzahlen" section, in display order. */
export const METRIC_SPECS: MetricSpec[] = [
  {
    id: 'equity_ratio',
    labelDe: 'Eigenkapitalquote',
    shortDe: 'Anteil des Eigenkapitals am Gesamtkapital.',
    formulaDe: 'Eigenkapital / Bilanzsumme',
    forms: [
      {
        numerator: [{ key: 'equity_total', sign: 1 }],
        denominator: [{ key: 'total_assets', sign: 1 }],
      },
    ],
  },
  {
    id: 'debt_ratio',
    labelDe: 'Verschuldungsgrad',
    shortDe: 'Fremdkapital je Euro Eigenkapital.',
    formulaDe: '(Bilanzsumme − Eigenkapital) / Eigenkapital',
    forms: [
      {
        numerator: [
          { key: 'total_assets', sign: 1 },
          { key: 'equity_total', sign: -1 },
        ],
        denominator: [{ key: 'equity_total', sign: 1 }],
      },
    ],
  },
  {
    id: 'fixed_asset_coverage',
    labelDe: 'Anlagendeckungsgrad (statisch)',
    shortDe: 'Deckung des Anlagevermögens durch Eigenkapital.',
    formulaDe: 'Eigenkapital / Anlagevermögen',
    caveatDe:
      'Statische Betrachtung: der klassische Anlagendeckungsgrad I (Eigenkapital + langfristiges ' +
      'Fremdkapital) ist nicht ableitbar, da die Fristigkeiten der Passivseite nicht ausgewiesen sind.',
    forms: [
      {
        numerator: [{ key: 'equity_total', sign: 1 }],
        denominator: [{ key: 'fixed_assets_total', sign: 1 }],
      },
    ],
  },
  {
    id: 'liquidity_1',
    labelDe: 'Liquidität 1. Grades',
    shortDe: 'Engste Liquidität: sofort zahlungsfähige Mittel je Euro kurzfristigem Fremdkapital.',
    formulaDe: '(Kassenbestand, Bank + Wertpapiere des Umlaufvermögens) / kurzfristiges Fremdkapital',
    caveatDe: SHORT_TERM_DEBT_DE,
    forms: [
      {
        numerator: [
          { key: 'cash', sign: 1 },
          { key: 'securities_current_total', sign: 1, optional: true },
        ],
        denominator: SHORT_TERM_DEBT,
      },
    ],
  },
  {
    id: 'liquidity_2',
    labelDe: 'Liquidität 2. Grades',
    shortDe: 'Kurzfristige Zahlungsfähigkeit inklusive der Forderungen.',
    formulaDe: '(liquide Mittel + Forderungen und sonstige Vermögensgegenstände) / kurzfristiges Fremdkapital',
    caveatDe: SHORT_TERM_DEBT_DE,
    forms: [
      {
        numerator: [
          { key: 'cash', sign: 1 },
          { key: 'securities_current_total', sign: 1, optional: true },
          { key: 'receivables_total', sign: 1 },
        ],
        denominator: SHORT_TERM_DEBT,
      },
    ],
  },
  {
    id: 'liquidity_3',
    labelDe: 'Liquidität 3. Grades',
    shortDe: 'Umlaufvermögen je Euro kurzfristigem Fremdkapital.',
    formulaDe: 'Umlaufvermögen / kurzfristiges Fremdkapital',
    caveatDe: SHORT_TERM_DEBT_DE,
    forms: [
      {
        numerator: [{ key: 'current_assets_total', sign: 1 }],
        denominator: SHORT_TERM_DEBT,
      },
    ],
  },
  {
    id: 'ebit_margin',
    labelDe: 'EBIT-Marge',
    shortDe: 'Operatives Ergebnis relativ zur Gesamtleistung.',
    formulaDe: 'EBIT / Gesamtleistung (ersatzweise Umsatzerlöse)',
    caveatDe:
      'EBIT: ausgewiesenes Betriebsergebnis; ersatzweise Ergebnis nach Steuern + Steuern vom Einkommen ' +
      'und Ertrag − Finanzergebnis; ersatzweise Jahresergebnis + Zinsaufwand − Zinserträge ' +
      '(ohne Steuerentlastung). ' +
      MARGIN_BASE_DE,
    forms: marginForms(EBIT_NUMERATORS),
  },
  {
    id: 'net_margin',
    labelDe: 'Jahresergebnis-Marge',
    shortDe: 'Jahresergebnis relativ zur Gesamtleistung.',
    formulaDe: 'Jahresergebnis / Gesamtleistung (ersatzweise Umsatzerlöse)',
    caveatDe: MARGIN_BASE_DE,
    forms: marginForms([[{ key: 'net_result', sign: 1 }]]),
  },
  {
    id: 'personnel_ratio',
    labelDe: 'Personalaufwandsquote',
    shortDe: 'Personalaufwand relativ zur Gesamtleistung.',
    formulaDe: 'Personalaufwand / Gesamtleistung (ersatzweise Umsatzerlöse)',
    caveatDe: MARGIN_BASE_DE,
    forms: marginForms([[{ key: 'personnel_expenses_total', sign: 1 }]]),
  },
  {
    id: 'material_ratio',
    labelDe: 'Materialaufwandsquote',
    shortDe: 'Materialaufwand relativ zur Gesamtleistung.',
    formulaDe: 'Materialaufwand / Gesamtleistung (ersatzweise Umsatzerlöse)',
    caveatDe: MARGIN_BASE_DE,
    forms: marginForms([[{ key: 'material_expenses_total', sign: 1 }]]),
  },
  {
    id: 'roe',
    labelDe: 'Eigenkapitalrentabilität',
    shortDe: 'Verzinsung des Eigenkapitals.',
    formulaDe: 'Jahresergebnis / Eigenkapital',
    forms: [
      {
        numerator: [{ key: 'net_result', sign: 1 }],
        denominator: [{ key: 'equity_total', sign: 1 }],
      },
    ],
  },
  {
    id: 'roa',
    labelDe: 'Gesamtkapitalrentabilität',
    shortDe: 'Verzinsung des Gesamtkapitals.',
    formulaDe: '(Jahresergebnis + Zinsaufwand) / Bilanzsumme',
    caveatDe: 'Vereinfacht ohne Steuerentlastung aus dem Zinsaufwand.',
    forms: [
      {
        numerator: [
          { key: 'net_result', sign: 1 },
          { key: 'interest_expense', sign: 1, optional: true },
        ],
        denominator: [{ key: 'total_assets', sign: 1 }],
      },
    ],
  },
];

const METRIC_BY_ID = new Map<MetricId, MetricSpec>(METRIC_SPECS.map((spec) => [spec.id, spec]));

export function metricSpec(id: MetricId): MetricSpec {
  const spec = METRIC_BY_ID.get(id);
  if (!spec) throw new Error(`unknown metric: ${id}`);
  return spec;
}

interface Ctx {
  lookup: AnalysisLookup;
  periodId: string;
  missing: Set<string>;
  assumedZero: Set<string>;
}

function readRequired(ctx: Ctx, key: string): number | null {
  const value = ctx.lookup(key, ctx.periodId);
  if (value === null || value === undefined) {
    ctx.missing.add(key);
    return null;
  }
  return value;
}

function readOptional(ctx: Ctx, key: string): number {
  const value = ctx.lookup(key, ctx.periodId);
  if (value === null || value === undefined) {
    ctx.assumedZero.add(key);
    return 0;
  }
  return value;
}

/** Resolves a linear combination; null when a required part has no value. */
function resolveParts(
  ctx: Ctx,
  parts: FormulaPart[],
): { sum: number; inputs: FormulaInput[] } | null {
  let sum = 0;
  const inputs: FormulaInput[] = [];
  let complete = true;
  for (const part of parts) {
    const value = part.optional ? readOptional(ctx, part.key) : readRequired(ctx, part.key);
    if (value === null) {
      complete = false;
      inputs.push({ ...part, value: null });
      continue;
    }
    sum += part.sign * value;
    inputs.push({ ...part, value });
  }
  return complete ? { sum, inputs } : null;
}

interface FormAttempt {
  /** True when every required input of the derivation resolved. */
  complete: boolean;
  value: number | null;
  inputs: FormulaInput[];
  missing: Set<string>;
  assumedZero: Set<string>;
  note?: string;
}

function attempt(form: RatioFormula, lookup: AnalysisLookup, periodId: string): FormAttempt {
  const ctx: Ctx = { lookup, periodId, missing: new Set(), assumedZero: new Set() };
  const numerator = resolveParts(ctx, form.numerator);
  const denominator = resolveParts(ctx, form.denominator);
  const inputs = [...(numerator?.inputs ?? []), ...(denominator?.inputs ?? [])];
  const base = { inputs, missing: ctx.missing, assumedZero: ctx.assumedZero };
  if (!numerator || !denominator) return { complete: false, value: null, ...base };
  if (denominator.sum === 0) {
    return { complete: true, value: null, note: 'Nenner 0 – Kennzahl nicht definiert.', ...base };
  }
  return { complete: true, value: numerator.sum / denominator.sum, ...base };
}

/** The metric's value for one year, with the derivation details for the UI. */
export function computeMetric(
  spec: MetricSpec,
  lookup: AnalysisLookup,
  periodId: string,
): MetricYearValue {
  const attempts = spec.forms.map((form) => attempt(form, lookup, periodId));
  const winner = attempts.find((a) => a.complete);
  if (winner) {
    return {
      value: winner.value,
      missing: [],
      assumedZero: [...winner.assumedZero],
      inputs: winner.inputs,
      note: winner.note,
    };
  }
  // No derivation was complete: list everything that could enable the metric.
  const missing = new Set<string>();
  const assumedZero = new Set<string>();
  const inputs: FormulaInput[] = [];
  const seen = new Set<string>();
  for (const a of attempts) {
    for (const key of a.missing) missing.add(key);
    for (const key of a.assumedZero) assumedZero.add(key);
    for (const input of a.inputs) {
      const id = `${input.key}:${input.sign}`;
      if (seen.has(id)) continue;
      seen.add(id);
      inputs.push(input);
    }
  }
  return { value: null, missing: [...missing], assumedZero: [...assumedZero], inputs };
}

/** Every metric with its value for each of the given periods (oldest first). */
export function computeMetricRows(lookup: AnalysisLookup, periodIds: string[]): MetricRow[] {
  return METRIC_SPECS.map((spec) => ({
    spec,
    values: Object.fromEntries(periodIds.map((id) => [id, computeMetric(spec, lookup, id)])),
  }));
}

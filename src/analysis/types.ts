/**
 * Shared types of the analysis layer (`src/analysis`).
 *
 * The analysis functions are pure TypeScript: no React, no I/O, no network.
 * They compute ratios, time series and plausibility findings from the fact
 * values of a dataset. Conventions follow `src/types.ts`: amounts in the
 * dataset unit, results with economic sign (a loss is negative), ratios as
 * fractions (0.269 = 26.9 %).
 */

/**
 * Looks up a fact value.
 *  - `undefined`: the key does not exist in the dataset (the company never
 *    prints that position)
 *  - `null`: the key exists, but there is no value for that period
 * Structurally compatible with `ValueLookup` of `src/lib/dataset.ts`.
 */
export type AnalysisLookup = (key: string, periodId: string) => number | null | undefined;

export type MetricId =
  | 'equity_ratio'
  | 'debt_ratio'
  | 'fixed_asset_coverage'
  | 'liquidity_1'
  | 'liquidity_2'
  | 'liquidity_3'
  | 'ebit_margin'
  | 'net_margin'
  | 'personnel_ratio'
  | 'material_ratio'
  | 'roe'
  | 'roa';

/**
 * One input of a metric formula. `sign` makes subtracted positions explicit,
 * e.g. pensions subtracted from the short-term debt proxy.
 */
export interface FormulaPart {
  key: string;
  sign: 1 | -1;
  /**
   * An additive component a report may leave unprinted when it is empty or
   * immaterial (§ 265 Abs. 8 HGB). A missing optional part counts as 0 and is
   * disclosed in the "Berechnung" details instead of making the metric n/a.
   */
  optional?: boolean;
}

/** One derivation of a metric: a ratio of two linear combinations of fact values. */
export interface RatioFormula {
  numerator: FormulaPart[];
  denominator: FormulaPart[];
}

export interface MetricSpec {
  id: MetricId;
  /** Name shown in the UI, e.g. "Eigenkapitalquote". */
  labelDe: string;
  /** One-line description of what the ratio expresses. */
  shortDe: string;
  /** Human-readable formula for the "Berechnung" details. */
  formulaDe: string;
  /** Documented approximations, shown under the formula. */
  caveatDe?: string;
  /**
   * Alternative derivations in order of preference, e.g. the EBIT margin from
   * the Betriebsergebnis or from the GuV chain. The first derivation whose
   * inputs all resolve wins.
   */
  forms: RatioFormula[];
}

/** One input as resolved for one year (basis of the "Berechnung" details). */
export interface FormulaInput extends FormulaPart {
  /** The value used in the formula; 0 for assumed-zero parts, null when missing. */
  value: number | null;
}

/** The value of one metric in one year, with everything the UI needs for tooltips. */
export interface MetricYearValue {
  /** Ratio as a fraction (0.269 = 26.9 %); null when not computable. */
  value: number | null;
  /** Required inputs without a value in that year. */
  missing: string[];
  /** Optional inputs counted as 0 because the report does not disclose them. */
  assumedZero: string[];
  /** Input values of the derivation that was used (or merged when none was). */
  inputs: FormulaInput[];
  /** German explanation when the metric is n/a although no input is missing. */
  note?: string;
}

export interface MetricRow {
  spec: MetricSpec;
  values: Record<string, MetricYearValue>;
}

/** One point of a time series. */
export interface SeriesPoint {
  periodId: string;
  value: number | null;
}

/** Change of a series point against its predecessor. */
export interface YearChange {
  periodId: string;
  /** Absolute change (null for the first point or missing values). */
  abs: number | null;
  /** Relative change as a fraction (null when the base is missing/zero or the sign flips). */
  rel: number | null;
}

/** A point flagged as unusual for its series. */
export interface OutlierFlag {
  periodId: string;
  /** Deviation from the series mean in standard deviations. */
  z: number;
}

export type FindingSeverity = 'pass' | 'warn' | 'fail' | 'skip';

export interface CheckFinding {
  id: string;
  labelDe: string;
  severity: FindingSeverity;
  periodId?: string;
  /** German explanation, shown in the expandable findings list. */
  detailDe: string;
}

export interface CheckSummary {
  /** Green: everything plausible. Amber: deviations or nothing testable. Red: a check failed. */
  status: 'green' | 'amber' | 'red';
  findings: CheckFinding[];
  passed: number;
  warned: number;
  failed: number;
  skipped: number;
}

/** The facts of one raw report extract (structurally compatible with `ParsedReport`). */
export interface RawReportFact {
  key: string;
  labelDe: string;
  /** Own year and prior-year comparison column of that report. */
  values: Record<string, number | null>;
}

export interface RawReport {
  /** The report's own fiscal year. */
  periodId: string;
  facts: RawReportFact[];
}

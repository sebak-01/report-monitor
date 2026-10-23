/**
 * Dataset format (schema version 0.3).
 *
 * One `Fact` is one reported figure with its values for several periods.
 * Units:
 *  - EUR / TEUR : amounts in euros / thousand euros
 *  - count      : a plain number (e.g. headcount)
 *  - pct        : a percentage number, 88.9 means 88.9 %
 *  - ratio      : a fraction, 0.269 means 26.9 % (used by derived KPIs)
 */
export type Unit = 'EUR' | 'TEUR' | 'count' | 'pct' | 'ratio';

export interface Period {
  id: string;
  start: string;
  end: string;
  /** True when the period only exists as a comparison column of the next report (no own report). */
  comparisonOnly?: boolean;
}

export type Emphasis = 'total' | 'subtotal' | 'memo';

/** How one report year prints a line differently from the default layout of the fact. */
export interface FactLayout {
  labelDe?: string;
  numberLabel?: string;
  printSign?: 1 | -1;
}

export interface Fact {
  key: string;
  /** Statement the fact belongs to, e.g. "balance_assets", "income" or "notes". */
  statement: string;
  parentKey?: string;
  labelDe: string;
  /** Position number as printed in the report, e.g. "A.", "II.", "1.", "a)". */
  numberLabel?: string;
  /** How the row is drawn in a statement table. `memo` rows are "davon ..." lines. */
  emphasis?: Emphasis;
  /**
   * -1 when the report prints the opposite sign of the stored (economic) value,
   * e.g. a loss is stored negative but printed as a positive "Jahresfehlbetrag".
   */
  printSign?: 1 | -1;
  unit: Unit;
  /** Value per period id. `null` means "not printed, not available or redacted in the source". */
  values: Record<string, number | null>;
  /** Report years whose layout has no such line. The row is hidden there (its stored value is 0 or null). */
  absentIn?: string[];
  /** Per report year: label, number or print sign that differ from the defaults above. */
  layouts?: Record<string, FactLayout>;
  page?: number;
  note?: string;
}

export interface DerivedKpi {
  key: string;
  labelDe: string;
  /** Formula over fact keys, e.g. "equity_total / total_assets". `key[prev]` is the previous period. */
  formula: string;
  unit: Unit;
}

/** A reconciliation check: `lhs` must equal `rhs` within the dataset tolerance. */
export interface Check {
  id: string;
  labelDe: string;
  lhs: string;
  rhs: string;
  /** Views in which the check is shown. Without it, the check is shown in every view. */
  views?: string[];
  /** Periods the check applies to. Without it, it runs for every period. */
  periods?: string[];
}

export interface StatementMeta {
  labelDe: string;
  page?: number;
}

/** A selectable page of the dashboard (e.g. Bilanz, Gewinn- und Verlustrechnung). */
export interface ViewMeta {
  id: string;
  labelDe: string;
  sourceDe?: string;
  statements: string[];
}

export interface Note {
  view: string;
  textDe: string;
  /** Periods the note applies to. Without it, it is shown for every period. */
  periods?: string[];
  page?: number;
}

/** Something the source publishes but blacks out. Shown as a notice, never silently dropped. */
export interface Redaction {
  view: string;
  /** `redacted`: blacked out in the PDF. `missing`: not part of the published document. */
  kind?: 'redacted' | 'missing';
  periods?: string[];
  page?: number;
  labelDe: string;
  detailDe: string;
}

/** The published report one period's figures come from. */
export interface SourceDoc {
  period: string;
  title: string;
  url?: string;
  pagesUsed?: string;
  extraction?: string;
  verified?: boolean;
}

export interface Dataset {
  schemaVersion: string;
  entity: {
    id: string;
    name: string;
    legalForm?: string;
    seat?: string;
    register?: string;
    accountingStandard?: string;
    incomeStatementMethod?: string;
    /** Names the company had before; the current name stays the headline. */
    formerNames?: { name: string; until?: string }[];
  };
  sources: SourceDoc[];
  periods: Period[];
  conventions: {
    currency: string;
    tolerance?: number;
    signs?: string;
    nullMeaning?: string;
    units?: Record<string, string>;
  };
  statements: Record<string, StatementMeta>;
  views: ViewMeta[];
  facts: Fact[];
  derivedKpis: DerivedKpi[];
  checks: Check[];
  notes?: Note[];
  redactions?: Redaction[];
}

import type { Unit } from '../types';

const LOCALE = 'de-DE';

const decimals = (digits: number) =>
  new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });

const eur = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR' });
const percent1 = new Intl.NumberFormat(LOCALE, {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const signedPercent1 = new Intl.NumberFormat(LOCALE, {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});
const signedDecimal1 = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});
const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const signedInteger = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
});
const d1 = decimals(1);
const d2 = decimals(2);

/** 2074189.84 -> "2.074.189,84 €" */
export const formatEur = (value: number): string => eur.format(value);

/** 2074189.84 -> "2,07 Mio. €" */
export const formatEurMio = (value: number): string => `${d2.format(value / 1e6)} Mio. €`;

/** Axis tick in millions, without unit: 1500000 -> "1,5" */
export const formatMioTick = (value: number): string =>
  new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(value / 1e6);

/** 0.269 -> "26,9 %" */
export const formatRatio = (fraction: number): string => percent1.format(fraction);

/** 0.174 -> "+17,4 %" */
export const formatSignedRatio = (fraction: number): string => signedPercent1.format(fraction);

/** Difference of two ratios in percentage points: 0.0377 -> "+3,8 Prozentpunkte" */
export const formatPercentagePoints = (fractionDiff: number): string =>
  `${signedDecimal1.format(fractionDiff * 100)} Prozentpunkte`;

export const formatInteger = (value: number): string => integer.format(value);
export const formatSignedInteger = (value: number): string => signedInteger.format(value);

/** Formats a fact value according to its unit (used in tables). */
export function formatByUnit(value: number | null, unit: Unit): string {
  if (value === null) return '–';
  switch (unit) {
    case 'EUR':
      return formatEur(value);
    case 'TEUR':
      return `${d1.format(value)} T€`;
    case 'pct':
      return `${d1.format(value)} %`;
    case 'ratio':
      return formatRatio(value);
    case 'count':
      return formatInteger(value);
  }
}

/** 2074189.84 -> "2.074.189,84" (no currency sign, for table columns headed "EUR") */
export const formatAmount = (value: number): string => d2.format(value);

/** 308136.84 -> "+308.136,84", -0.5 -> "-0,50" */
const signedAmount = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});
export const formatSignedAmount = (value: number): string => signedAmount.format(value);

/** 69732.4 -> "69.732 €" */
export const formatEurRounded = (value: number): string =>
  `${integer.format(value)} €`;

/** Thousand euros: 72 -> "72 T€" */
export const formatTeur = (value: number): string => `${integer.format(value)} T€`;

/** Relative change as a signed percentage, or null when it is not meaningful (no or zero base). */
export function relativeChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const compact = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });

/** Axis and tooltip formats for a chart whose values all have the same unit. */
export function unitFormat(unit: Unit): { axisName: string; tick: (v: number) => string; value: (v: number) => string } {
  switch (unit) {
    case 'EUR':
      return { axisName: 'in €', tick: (v) => compact.format(v), value: (v) => formatEur(v) };
    case 'TEUR':
      return { axisName: 'in T€', tick: (v) => compact.format(v), value: (v) => formatByUnit(v, 'TEUR') };
    case 'pct':
      return { axisName: 'in %', tick: (v) => compact.format(v), value: (v) => formatByUnit(v, 'pct') };
    case 'ratio':
      return { axisName: 'in %', tick: (v) => compact.format(v * 100), value: (v) => formatRatio(v) };
    case 'count':
      return { axisName: 'Anzahl', tick: (v) => compact.format(v), value: (v) => formatInteger(v) };
  }
}

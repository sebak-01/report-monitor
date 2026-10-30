import type { Emphasis } from '../types';

/**
 * The balance sheet as a fixed § 266 HGB skeleton ("Gliederung der Bilanz").
 *
 * The dashboard shows the posts of § 266 with the designations, numbers and
 * order of the law – not the layout of a single report. Exception on the
 * liabilities side: "B. Sonderposten" follows "A. Eigenkapital" and the
 * remaining posts continue in order (C. Rückstellungen, D. Verbindlichkeiten,
 * E. Rechnungsabgrenzungsposten, F. Passive latente Steuern).
 *
 * Dataset facts fill the rows via `factKeys`; several facts may feed one row
 * ("in sonstige zusammenfassen"). Posts no dataset reports stay in place with
 * empty values. The printed designations of the facts are kept as tooltips.
 */

export interface BalanceRowSpec {
  /** Canonical row key; where a dataset fact exists, it carries the same key. */
  key: string;
  /** Designation per § 266 HGB. */
  labelDe: string;
  /** Post number per § 266 HGB ("A.", "I.", "1."); empty for "davon" lines and totals. */
  numberLabel: string;
  parentKey?: string;
  emphasis?: Emphasis;
  /** Dataset fact keys whose values fill this row; defaults to `[key]`. */
  factKeys?: string[];
}

const ASSETS: BalanceRowSpec[] = [
  { key: 'fixed_assets_total', labelDe: 'Anlagevermögen', numberLabel: 'A.', emphasis: 'subtotal' },
  {
    key: 'intangible_assets',
    labelDe: 'Immaterielle Vermögensgegenstände',
    numberLabel: 'I.',
    parentKey: 'fixed_assets_total',
    emphasis: 'subtotal',
  },
  {
    key: 'intangible_self_created',
    labelDe: 'Selbst geschaffene gewerbliche Schutzrechte und ähnliche Rechte und Werte',
    numberLabel: '1.',
    parentKey: 'intangible_assets',
  },
  {
    key: 'intangible_licenses',
    labelDe:
      'Entgeltlich erworbene Konzessionen, gewerbliche Schutzrechte und ähnliche Rechte und Werte sowie Lizenzen an solchen Rechten und Werten',
    numberLabel: '2.',
    parentKey: 'intangible_assets',
  },
  { key: 'goodwill', labelDe: 'Geschäfts- oder Firmenwert', numberLabel: '3.', parentKey: 'intangible_assets' },
  { key: 'intangible_advances', labelDe: 'Geleistete Anzahlungen', numberLabel: '4.', parentKey: 'intangible_assets' },
  {
    key: 'tangible_assets_total',
    labelDe: 'Sachanlagen',
    numberLabel: 'II.',
    parentKey: 'fixed_assets_total',
    emphasis: 'subtotal',
  },
  {
    key: 'land_buildings',
    labelDe: 'Grundstücke, grundstücksgleiche Rechte und Bauten einschließlich der Bauten auf fremden Grundstücken',
    numberLabel: '1.',
    parentKey: 'tangible_assets_total',
  },
  {
    key: 'technical_equipment',
    labelDe: 'Technische Anlagen und Maschinen',
    numberLabel: '2.',
    parentKey: 'tangible_assets_total',
  },
  {
    key: 'other_equipment',
    labelDe: 'Andere Anlagen, Betriebs- und Geschäftsausstattung',
    numberLabel: '3.',
    parentKey: 'tangible_assets_total',
  },
  {
    key: 'construction_in_progress',
    labelDe: 'Geleistete Anzahlungen und Anlagen im Bau',
    numberLabel: '4.',
    parentKey: 'tangible_assets_total',
  },
  {
    key: 'financial_assets_total',
    labelDe: 'Finanzanlagen',
    numberLabel: 'III.',
    parentKey: 'fixed_assets_total',
    emphasis: 'subtotal',
  },
  {
    key: 'financial_affiliate_investments',
    labelDe: 'Anteile an verbundenen Unternehmen',
    numberLabel: '1.',
    parentKey: 'financial_assets_total',
  },
  {
    key: 'financial_affiliate_loans',
    labelDe: 'Ausleihungen an verbundene Unternehmen',
    numberLabel: '2.',
    parentKey: 'financial_assets_total',
  },
  { key: 'financial_holdings', labelDe: 'Beteiligungen', numberLabel: '3.', parentKey: 'financial_assets_total' },
  {
    key: 'financial_associated_loans',
    labelDe: 'Ausleihungen an Unternehmen, mit denen ein Beteiligungsverhältnis besteht',
    numberLabel: '4.',
    parentKey: 'financial_assets_total',
  },
  {
    key: 'financial_securities',
    labelDe: 'Wertpapiere des Anlagevermögens',
    numberLabel: '5.',
    parentKey: 'financial_assets_total',
  },
  {
    key: 'financial_other_loans',
    labelDe: 'Sonstige Ausleihungen',
    numberLabel: '6.',
    parentKey: 'financial_assets_total',
  },
  {
    key: 'current_assets_total',
    labelDe: 'Umlaufvermögen',
    numberLabel: 'B.',
    emphasis: 'subtotal',
  },
  {
    key: 'inventories_total',
    labelDe: 'Vorräte',
    numberLabel: 'I.',
    parentKey: 'current_assets_total',
    emphasis: 'subtotal',
  },
  {
    key: 'raw_materials',
    labelDe: 'Roh-, Hilfs- und Betriebsstoffe',
    numberLabel: '1.',
    parentKey: 'inventories_total',
  },
  {
    key: 'work_in_progress',
    labelDe: 'Unfertige Erzeugnisse, unfertige Leistungen',
    numberLabel: '2.',
    parentKey: 'inventories_total',
  },
  {
    key: 'finished_goods',
    labelDe: 'Fertige Erzeugnisse und Waren',
    numberLabel: '3.',
    parentKey: 'inventories_total',
  },
  {
    key: 'inventory_advance_payments',
    labelDe: 'Geleistete Anzahlungen',
    numberLabel: '4.',
    parentKey: 'inventories_total',
  },
  {
    key: 'receivables_total',
    labelDe: 'Forderungen und sonstige Vermögensgegenstände',
    numberLabel: 'II.',
    parentKey: 'current_assets_total',
    emphasis: 'subtotal',
  },
  {
    key: 'trade_receivables',
    labelDe: 'Forderungen aus Lieferungen und Leistungen',
    numberLabel: '1.',
    parentKey: 'receivables_total',
  },
  {
    key: 'affiliated_receivables',
    labelDe: 'Forderungen gegen verbundene Unternehmen',
    numberLabel: '2.',
    parentKey: 'receivables_total',
  },
  {
    key: 'associated_receivables',
    labelDe: 'Forderungen gegen Unternehmen, mit denen ein Beteiligungsverhältnis besteht',
    numberLabel: '3.',
    parentKey: 'receivables_total',
  },
  {
    key: 'other_assets',
    labelDe: 'Sonstige Vermögensgegenstände',
    numberLabel: '4.',
    parentKey: 'receivables_total',
    factKeys: ['other_assets', 'grantor_receivables', 'shareholder_receivables'],
  },
  {
    key: 'securities_current_total',
    labelDe: 'Wertpapiere',
    numberLabel: 'III.',
    parentKey: 'current_assets_total',
    emphasis: 'subtotal',
  },
  {
    key: 'securities_current_affiliate',
    labelDe: 'Anteile an verbundenen Unternehmen',
    numberLabel: '1.',
    parentKey: 'securities_current_total',
  },
  {
    key: 'securities_current_other',
    labelDe: 'Sonstige Wertpapiere',
    numberLabel: '2.',
    parentKey: 'securities_current_total',
  },
  {
    key: 'cash',
    labelDe: 'Kassenbestand, Bundesbankguthaben, Guthaben bei Kreditinstituten und Schecks',
    numberLabel: 'IV.',
    parentKey: 'current_assets_total',
  },
  { key: 'prepaid_expenses', labelDe: 'Rechnungsabgrenzungsposten', numberLabel: 'C.' },
  { key: 'deferred_tax_asset', labelDe: 'Aktive latente Steuern', numberLabel: 'D.' },
  {
    key: 'net_pension_asset',
    labelDe: 'Aktiver Unterschiedsbetrag aus der Vermögensverrechnung',
    numberLabel: 'E.',
  },
  { key: 'total_assets', labelDe: 'Bilanzsumme', numberLabel: '', emphasis: 'total' },
];

const LIABILITIES: BalanceRowSpec[] = [
  { key: 'equity_total', labelDe: 'Eigenkapital', numberLabel: 'A.', emphasis: 'subtotal' },
  {
    key: 'subscribed_capital',
    labelDe: 'Gezeichnetes Kapital',
    numberLabel: 'I.',
    parentKey: 'equity_total',
  },
  { key: 'capital_reserve', labelDe: 'Kapitalrücklage', numberLabel: 'II.', parentKey: 'equity_total' },
  {
    key: 'retained_earnings_total',
    labelDe: 'Gewinnrücklagen',
    numberLabel: 'III.',
    parentKey: 'equity_total',
    emphasis: 'subtotal',
  },
  {
    key: 'retained_earnings_statutory',
    labelDe: 'Gesetzliche Rücklage',
    numberLabel: '1.',
    parentKey: 'retained_earnings_total',
  },
  {
    key: 'retained_earnings_affiliate',
    labelDe: 'Rücklage für Anteile an einem herrschenden oder mehrheitlich beteiligten Unternehmen',
    numberLabel: '2.',
    parentKey: 'retained_earnings_total',
  },
  {
    key: 'retained_earnings_bylaws',
    labelDe: 'Satzungsmäßige Rücklagen',
    numberLabel: '3.',
    parentKey: 'retained_earnings_total',
  },
  {
    key: 'retained_earnings_other',
    labelDe: 'Andere Gewinnrücklagen',
    numberLabel: '4.',
    parentKey: 'retained_earnings_total',
  },
  {
    key: 'profit_loss_carryforward',
    labelDe: 'Gewinnvortrag/Verlustvortrag',
    numberLabel: 'IV.',
    parentKey: 'equity_total',
  },
  {
    key: 'net_result_balance',
    labelDe: 'Jahresüberschuss/Jahresfehlbetrag',
    numberLabel: 'V.',
    parentKey: 'equity_total',
  },
  { key: 'special_item_grants', labelDe: 'Sonderposten', numberLabel: 'B.' },
  { key: 'provisions_total', labelDe: 'Rückstellungen', numberLabel: 'C.', emphasis: 'subtotal' },
  {
    key: 'pension_provisions',
    labelDe: 'Rückstellungen für Pensionen und ähnliche Verpflichtungen',
    numberLabel: '1.',
    parentKey: 'provisions_total',
  },
  {
    key: 'tax_provisions',
    labelDe: 'Steuerrückstellungen',
    numberLabel: '2.',
    parentKey: 'provisions_total',
  },
  {
    key: 'other_provisions',
    labelDe: 'Sonstige Rückstellungen',
    numberLabel: '3.',
    parentKey: 'provisions_total',
  },
  { key: 'liabilities_total', labelDe: 'Verbindlichkeiten', numberLabel: 'D.', emphasis: 'subtotal' },
  { key: 'bonds', labelDe: 'Anleihen', numberLabel: '1.', parentKey: 'liabilities_total' },
  { key: 'bonds_convertible', labelDe: 'davon konvertibel', numberLabel: '', parentKey: 'bonds', emphasis: 'memo' },
  {
    key: 'bank_liabilities',
    labelDe: 'Verbindlichkeiten gegenüber Kreditinstituten',
    numberLabel: '2.',
    parentKey: 'liabilities_total',
  },
  {
    key: 'advance_payments_received',
    labelDe: 'Erhaltene Anzahlungen auf Bestellungen',
    numberLabel: '3.',
    parentKey: 'liabilities_total',
  },
  {
    key: 'trade_payables',
    labelDe: 'Verbindlichkeiten aus Lieferungen und Leistungen',
    numberLabel: '4.',
    parentKey: 'liabilities_total',
  },
  {
    key: 'notes_payable',
    labelDe: 'Verbindlichkeiten aus der Annahme gezogener Wechsel und der Ausstellung eigener Wechsel',
    numberLabel: '5.',
    parentKey: 'liabilities_total',
  },
  {
    key: 'affiliated_liabilities',
    labelDe: 'Verbindlichkeiten gegenüber verbundenen Unternehmen',
    numberLabel: '6.',
    parentKey: 'liabilities_total',
  },
  {
    key: 'associated_liabilities',
    labelDe: 'Verbindlichkeiten gegenüber Unternehmen, mit denen ein Beteiligungsverhältnis besteht',
    numberLabel: '7.',
    parentKey: 'liabilities_total',
  },
  {
    key: 'other_liabilities',
    labelDe: 'Sonstige Verbindlichkeiten',
    numberLabel: '8.',
    parentKey: 'liabilities_total',
    factKeys: ['other_liabilities', 'unused_grants_liabilities', 'shareholder_liabilities'],
  },
  {
    key: 'other_liabilities_taxes',
    labelDe: 'davon aus Steuern',
    numberLabel: '',
    parentKey: 'other_liabilities',
    emphasis: 'memo',
  },
  {
    key: 'other_liabilities_social',
    labelDe: 'davon im Rahmen der sozialen Sicherheit',
    numberLabel: '',
    parentKey: 'other_liabilities',
    emphasis: 'memo',
  },
  { key: 'deferred_income', labelDe: 'Rechnungsabgrenzungsposten', numberLabel: 'E.' },
  { key: 'deferred_tax_liability', labelDe: 'Passive latente Steuern', numberLabel: 'F.' },
  { key: 'total_equity_and_liabilities', labelDe: 'Bilanzsumme', numberLabel: '', emphasis: 'total' },
];

export const BALANCE_LAYOUT: Record<'balance_assets' | 'balance_liabilities', BalanceRowSpec[]> = {
  balance_assets: ASSETS,
  balance_liabilities: LIABILITIES,
};

/** Fact key -> the row it fills. A fact that appears nowhere feeds no row. */
export function factKeyIndex(layout: BalanceRowSpec[]): Map<string, BalanceRowSpec> {
  const index = new Map<string, BalanceRowSpec>();
  for (const row of layout) {
    for (const key of row.factKeys ?? [row.key]) index.set(key, row);
  }
  return index;
}

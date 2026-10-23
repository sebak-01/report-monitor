import { useMemo, useState } from 'react';
import { ChartControls, type ChartType } from '../components/ChartControls';
import { DataTable, type DataTableRow } from '../components/DataTable';
import { GroupedBarChart } from '../components/GroupedBarChart';
import { TrendChart } from '../components/TrendChart';
import { StatementTable } from '../components/StatementTable';
import { ValidationPanel } from '../components/ValidationPanel';
import { de } from '../i18n/de';
import { sortedPeriods } from '../lib/dataset';
import { formatAmount, formatByUnit, formatTeur } from '../lib/format';
import { buildGroupedModel, buildTrendModel } from '../lib/grouped';
import { buildKpiCards } from '../lib/kpiCards';
import { buildStatementRows } from '../lib/statementRows';
import { useChartYears } from '../components/useChartYears';
import { DEFAULT_TOLERANCE } from '../lib/validate';
import {
  CollapsibleCard,
  createViewContext,
  forView,
  KpiGrid,
  NoteList,
  periodEnd,
  Redactions,
  type ViewProps,
} from './common';

const VIEW_ID = 'income';

/** Not shown in the dashboard: the auditor fee is not relevant here. */
const HIDDEN_REDACTIONS = ['Gesamthonorar des Abschlussprüfers'];

const ITEMS_CHART = [
  { key: 'revenue', label: 'Umsatzerlöse' },
  { key: 'other_operating_income', label: 'Sonstige betriebliche Erträge' },
  { key: 'material_expenses_total', label: 'Materialaufwand' },
  { key: 'personnel_expenses_total', label: 'Personalaufwand' },
  { key: 'depreciation', label: 'Abschreibungen' },
  { key: 'other_operating_expenses', label: 'Sonstige betriebliche Aufwendungen' },
  // The result is stored negative; shown as a positive amount next to the other items.
  { key: 'net_result', label: 'Jahresfehlbetrag', negate: true },
];

const REVENUE_PARTS = [
  'revenue_testing',
  'revenue_project_grants',
  'revenue_cost_reimbursements',
  'revenue_other',
  'revenue_research_consulting',
  'revenue_seminars',
];

const TREND_ITEMS = [
  { key: 'revenue', label: de.income.trendItems.revenue },
  { key: 'other_operating_income', label: de.income.trendItems.otherIncome },
  { key: 'personnel_expenses_total', label: de.income.trendItems.personnel },
  // The result is stored negative; shown as a positive loss next to the other items.
  { key: 'net_result', label: de.income.trendItems.netLoss, negate: true },
];

export function IncomeView({ dataset, periodId, report }: ViewProps) {
  const ctx = useMemo(() => createViewContext(dataset, periodId), [dataset, periodId]);
  const cards = useMemo(() => buildKpiCards(dataset, VIEW_ID, periodId), [dataset, periodId]);
  const trendModel = useMemo(() => buildTrendModel(dataset, TREND_ITEMS), [dataset]);
  const labelOf = useMemo(() => new Map(dataset.facts.map((f) => [f.key, f.labelDe])), [dataset]);
  const allYears = useMemo(() => sortedPeriods(dataset).map((p) => p.id), [dataset]);

  const itemsYears = useChartYears(allYears);
  const [itemsType, setItemsType] = useState<ChartType>('bar');
  const revenueYears = useChartYears(allYears);
  const [revenueType, setRevenueType] = useState<ChartType>('bar');
  const priorYears = useChartYears(allYears);

  const itemsModel = useMemo(
    () => buildGroupedModel(dataset, ITEMS_CHART, 'EUR', itemsYears.years),
    [dataset, itemsYears.years],
  );
  const revenueModel = useMemo(
    () => buildGroupedModel(dataset, REVENUE_PARTS.map((key) => ({ key })), 'EUR', revenueYears.years),
    [dataset, revenueYears.years],
  );

  if (!ctx) return null;
  const { currentId, previousId, value } = ctx;
  const prevLabel = previousId ?? '';

  const amount = (key: string, period: string | null) => {
    const v = value(key, period);
    return v === null ? '–' : formatAmount(v);
  };
  const teur = (key: string, period: string | null) => {
    const v = value(key, period);
    return v === null ? '–' : formatTeur(v);
  };
  const pct = (key: string, period: string | null) => formatByUnit(value(key, period), 'pct');

  const rows = buildStatementRows(dataset, 'income', currentId, previousId);

  const revenueRows: DataTableRow[] = REVENUE_PARTS.map((key) => ({
    key,
    label: labelOf.get(key) ?? key,
    cells: [amount(key, currentId), amount(key, previousId)],
  }));
  revenueRows.push({
    key: 'revenue',
    label: de.income.revenueTotal,
    kind: 'total',
    cells: [amount('revenue', currentId), amount('revenue', previousId)],
  });

  // Detail lines of the prior-period items: only those with a value in one of the shown years.
  const shownPriorYears = priorYears.years;
  const priorColumns = [...shownPriorYears].reverse();
  const detailKeys = (parent: string) =>
    dataset.facts
      .filter((f) => f.parentKey === parent && shownPriorYears.some((p) => (value(f.key, p) ?? 0) !== 0))
      .map((f) => f.key);
  const priorRows: DataTableRow[] = [];
  for (const [parent, label] of [
    ['prior_period_income', de.income.priorIncome],
    ['prior_period_expenses', de.income.priorExpenses],
  ] as const) {
    if (!shownPriorYears.some((p) => value(parent, p) !== null)) continue;
    priorRows.push({ key: parent, label, cells: priorColumns.map((p) => teur(parent, p)) });
    for (const key of detailKeys(parent)) {
      priorRows.push({
        key,
        label: labelOf.get(key) ?? key,
        kind: 'memo',
        cells: priorColumns.map((p) => teur(key, p)),
      });
    }
  }

  const viewNotes = forView(dataset.notes, VIEW_ID, currentId);
  const redactions = forView(dataset.redactions, VIEW_ID, currentId).filter(
    (item) => !HIDDEN_REDACTIONS.includes(item.labelDe),
  );
  const periods = sortedPeriods(dataset)
    .map((p) => p.id)
    .reverse();

  return (
    <>
      <KpiGrid label={de.kpi.sectionLabel} cards={cards} />

      {trendModel && <TrendChart id="income-trend" model={trendModel} selected={currentId} />}

      {itemsModel && (
        <GroupedBarChart
          id="income-items"
          title={de.income.itemsChartTitle}
          subtitle={de.income.itemsChartSubtitle}
          model={itemsModel}
          type={itemsType}
          controls={
            <ChartControls
              periods={allYears}
              range={itemsYears.range}
              onRangeChange={itemsYears.setRange}
              type={itemsType}
              onTypeChange={setItemsType}
            />
          }
        />
      )}

      <section className="card" aria-labelledby="income-statement-title">
        <h2 id="income-statement-title" className="card-title">
          {de.income.statementTitle(periodEnd(dataset, currentId))}
        </h2>
        <p className="card-subtitle">{de.income.statementSubtitle}</p>
        <StatementTable
          title={dataset.statements['income']?.labelDe ?? de.income.statementTitle('')}
          rows={rows}
          currentLabel={currentId}
          previousLabel={prevLabel}
        />
      </section>

      <section className="anhang" aria-labelledby="income-anhang-title">
        <h2 id="income-anhang-title" className="anhang-title">
          {de.income.anhangTitle} <span className="muted">· {de.income.anhangSource}</span>
        </h2>

        {revenueModel && (
          <GroupedBarChart
            id="revenue-by-activity"
            title={de.income.revenueChartTitle}
            subtitle={de.income.revenueChartSubtitle}
            model={revenueModel}
            type={revenueType}
            controls={
              <ChartControls
                periods={allYears}
                range={revenueYears.range}
                onRangeChange={revenueYears.setRange}
                type={revenueType}
                onTypeChange={setRevenueType}
              />
            }
          />
        )}

        <div className="grid-2">
          <section className="card">
            <DataTable
              title={de.income.revenueTableTitle}
              subtitle={de.table.amountsInEur}
              columns={[currentId, prevLabel]}
              rows={revenueRows}
            />
          </section>

          <section className="card" aria-labelledby="region-title">
            <h4 id="region-title" className="statement-title">
              {de.income.regionTitle}
            </h4>
            <div className="tile-row">
              <div className="tile">
                <p className="tile-label">{de.income.domestic}</p>
                <p className="tile-value">{pct('revenue_share_domestic', currentId)}</p>
                <p className="tile-sub">{de.income.vsPrevious(prevLabel, pct('revenue_share_domestic', previousId))}</p>
              </div>
              <div className="tile">
                <p className="tile-label">{de.income.foreign}</p>
                <p className="tile-value">{pct('revenue_share_foreign', currentId)}</p>
                <p className="tile-sub">{de.income.vsPrevious(prevLabel, pct('revenue_share_foreign', previousId))}</p>
              </div>
            </div>
          </section>
        </div>

        {priorRows.length > 0 && (
          <CollapsibleCard title={de.income.priorPeriodTitle} subtitle={de.income.priorPeriodSubtitle}>
            <ChartControls
              periods={allYears}
              range={priorYears.range}
              onRangeChange={priorYears.setRange}
              type="bar"
              onTypeChange={() => {}}
              showType={false}
            />
            <DataTable columns={priorColumns} rows={priorRows} />
          </CollapsibleCard>
        )}

        <NoteList title={de.income.notesTitle} notes={viewNotes} />
        <Redactions items={redactions} />
      </section>

      <ValidationPanel report={report} periods={periods} tolerance={dataset.conventions.tolerance ?? DEFAULT_TOLERANCE} />
    </>
  );
}

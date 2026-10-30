import { useMemo, useState } from 'react';
import { ChartControls, type ChartType } from '../components/ChartControls';
import { GroupedBarChart } from '../components/GroupedBarChart';
import { TrendChart } from '../components/TrendChart';
import { StatementTable } from '../components/StatementTable';
import { ValidationPanel } from '../components/ValidationPanel';
import { de } from '../i18n/de';
import { sortedPeriods } from '../lib/dataset';
import { buildGroupedModel, buildTrendModel } from '../lib/grouped';
import { buildKpiCards } from '../lib/kpiCards';
import { buildStatementRows } from '../lib/statementRows';
import { useChartYears } from '../components/useChartYears';
import { DEFAULT_TOLERANCE } from '../lib/validate';
import { createViewContext, KpiGrid, periodEnd, type ViewProps } from './common';

const VIEW_ID = 'income';

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
  const allYears = useMemo(() => sortedPeriods(dataset).map((p) => p.id), [dataset]);

  const itemsYears = useChartYears(allYears);
  const [itemsType, setItemsType] = useState<ChartType>('bar');

  const itemsModel = useMemo(
    () => buildGroupedModel(dataset, ITEMS_CHART, 'EUR', itemsYears.years),
    [dataset, itemsYears.years],
  );

  if (!ctx) return null;
  const { currentId, previousId } = ctx;
  const prevLabel = previousId ?? '';

  const rows = buildStatementRows(dataset, 'income', currentId, previousId);

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

      <ValidationPanel report={report} periods={periods} tolerance={dataset.conventions.tolerance ?? DEFAULT_TOLERANCE} />
    </>
  );
}

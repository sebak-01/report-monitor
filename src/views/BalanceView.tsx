import { useMemo, useState } from 'react';
import { ChartControls, type ChartType } from '../components/ChartControls';
import { StackedBarChart } from '../components/StackedBarChart';
import { TrendChart } from '../components/TrendChart';
import { StatementTable } from '../components/StatementTable';
import { ValidationPanel } from '../components/ValidationPanel';
import { de } from '../i18n/de';
import { isEmptyDataset, sortedPeriods } from '../lib/dataset';
import { buildStackedModel, buildTrendModel } from '../lib/grouped';
import { buildKpiCards } from '../lib/kpiCards';
import { buildBalanceStatementRows } from '../lib/statementRows';
import { useChartYears } from '../components/useChartYears';
import { DEFAULT_TOLERANCE } from '../lib/validate';
import { createViewContext, KpiGrid, periodEnd, type ViewProps } from './common';

const VIEW_ID = 'balance';

const ASSET_PARTS = [
  { key: 'fixed_assets_total', label: 'Anlagevermögen' },
  { key: 'current_assets_total', label: 'Umlaufvermögen' },
  { key: 'prepaid_expenses', label: 'Rechnungsabgrenzungsposten' },
];

const LIABILITY_PARTS = [
  { key: 'equity_total', label: 'Eigenkapital' },
  { key: 'special_item_grants', label: 'Sonderposten' },
  { key: 'provisions_total', label: 'Rückstellungen' },
  { key: 'liabilities_total', label: 'Verbindlichkeiten' },
];

const TREND_ITEMS = [
  { key: 'total_assets', label: de.balance.trendItems.totalAssets },
  { key: 'fixed_assets_total', label: de.balance.trendItems.fixedAssets },
  { key: 'equity_total', label: de.balance.trendItems.equity },
  { key: 'cash', label: de.balance.trendItems.cash },
];

export function BalanceView({ dataset, periodId, report }: ViewProps) {
  const ctx = useMemo(() => createViewContext(dataset, periodId), [dataset, periodId]);
  const cards = useMemo(() => buildKpiCards(dataset, VIEW_ID, periodId), [dataset, periodId]);
  const trendModel = useMemo(() => buildTrendModel(dataset, TREND_ITEMS), [dataset]);
  const allYears = useMemo(() => sortedPeriods(dataset).map((p) => p.id), [dataset]);
  // Without any figure the boxes still show – every cell just reads "–".
  const empty = isEmptyDataset(dataset);

  const assetYears = useChartYears(allYears);
  const [assetType, setAssetType] = useState<ChartType>('bar');
  const liabilityYears = useChartYears(allYears);
  const [liabilityType, setLiabilityType] = useState<ChartType>('bar');

  // "Anzeige nach §266 HGB": the full catalogue of posts, empty ones included.
  // The empty start view keeps it on – with no data every cell just reads "–".
  const [hgbRows, setHgbRows] = useState(true);
  const includeEmptyRows = hgbRows || empty;

  const assetsModel = useMemo(
    () => buildStackedModel(dataset, ASSET_PARTS, assetYears.years),
    [dataset, assetYears.years],
  );
  const liabilitiesModel = useMemo(
    () => buildStackedModel(dataset, LIABILITY_PARTS, liabilityYears.years),
    [dataset, liabilityYears.years],
  );

  if (!ctx) return null;
  const { currentId, previousId } = ctx;
  const prevLabel = previousId ?? '';

  const assetRows = buildBalanceStatementRows(dataset, 'balance_assets', currentId, previousId, {
    includeEmptyRows,
  });
  const liabilityRows = buildBalanceStatementRows(dataset, 'balance_liabilities', currentId, previousId, {
    includeEmptyRows,
  });

  const periods = sortedPeriods(dataset)
    .map((p) => p.id)
    .reverse();

  return (
    <>
      <KpiGrid label={de.kpi.sectionLabel} cards={cards} />

      {trendModel && <TrendChart id="balance-trend" model={trendModel} selected={currentId} />}

      {assetsModel && liabilitiesModel && (
        <>
          <h3 className="section-label">{de.balance.structureTitle}</h3>
          <div className="grid-2">
            <StackedBarChart
              id="assets-structure"
              title={de.balance.assetsChartTitle}
              subtitle={de.balance.structureSubtitle}
              model={assetsModel}
              type={assetType}
              controls={
                <ChartControls
                  periods={allYears}
                  range={assetYears.range}
                  onRangeChange={assetYears.setRange}
                  type={assetType}
                  onTypeChange={setAssetType}
                />
              }
            />
            <StackedBarChart
              id="liabilities-structure"
              title={de.balance.liabilitiesChartTitle}
              subtitle={de.balance.structureSubtitle}
              model={liabilitiesModel}
              type={liabilityType}
              controls={
                <ChartControls
                  periods={allYears}
                  range={liabilityYears.range}
                  onRangeChange={liabilityYears.setRange}
                  type={liabilityType}
                  onTypeChange={setLiabilityType}
                />
              }
            />
          </div>
        </>
      )}

      <section className="card" aria-labelledby="balance-statement-title">
        <h2 id="balance-statement-title" className="card-title">
          {de.balance.statementTitle(periodEnd(dataset, currentId))}
        </h2>
        <p className="card-subtitle">{de.balance.statementSubtitle}</p>
        <label className="hgb-toggle">
          <input
            type="checkbox"
            checked={hgbRows}
            onChange={(event) => setHgbRows(event.target.checked)}
          />{' '}
          {de.balance.hgbToggle}
        </label>
        <StatementTable
          title={de.balance.assetsTable}
          rows={assetRows}
          currentLabel={currentId}
          previousLabel={prevLabel}
        />
        <StatementTable
          title={de.balance.liabilitiesTable}
          rows={liabilityRows}
          currentLabel={currentId}
          previousLabel={prevLabel}
        />
      </section>

      <ValidationPanel report={report} periods={periods} tolerance={dataset.conventions.tolerance ?? DEFAULT_TOLERANCE} />
    </>
  );
}

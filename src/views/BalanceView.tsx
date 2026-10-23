import { useMemo, useState } from 'react';
import { ChartControls, type ChartType } from '../components/ChartControls';
import { DataTable, type DataTableRow } from '../components/DataTable';
import { GroupedBarChart } from '../components/GroupedBarChart';
import { StackedBarChart } from '../components/StackedBarChart';
import { TrendChart } from '../components/TrendChart';
import { StatementTable } from '../components/StatementTable';
import { ValidationPanel } from '../components/ValidationPanel';
import { de } from '../i18n/de';
import { sortedPeriods } from '../lib/dataset';
import { formatAmount, formatEur } from '../lib/format';
import { buildGroupedModel, buildStackedModel, buildTrendModel } from '../lib/grouped';
import { buildKpiCards } from '../lib/kpiCards';
import { buildStatementRows } from '../lib/statementRows';
import { useChartYears } from '../components/useChartYears';
import { DEFAULT_TOLERANCE } from '../lib/validate';
import {
  AmountWithPrior,
  createViewContext,
  forView,
  KpiGrid,
  NoteList,
  periodEnd,
  Redactions,
  type ViewProps,
} from './common';

const VIEW_ID = 'balance';

/** Not shown in the dashboard: the Anlagenspiegel is not relevant here. */
const HIDDEN_REDACTIONS = ['Anlagenspiegel'];

const ASSET_PARTS = [
  { key: 'fixed_assets_total', label: 'Anlagevermögen' },
  { key: 'current_assets_total', label: 'Umlaufvermögen' },
  { key: 'prepaid_expenses', label: 'Rechnungsabgrenzungsposten' },
];

const LIABILITY_PARTS = [
  { key: 'equity_total', label: 'Eigenkapital' },
  { key: 'special_item_grants', label: 'Sonderposten für Investitionszuschüsse' },
  { key: 'provisions_total', label: 'Rückstellungen' },
  { key: 'liabilities_total', label: 'Verbindlichkeiten' },
];

const PROVISION_ITEMS = [
  { key: 'provisions_vacation', label: 'Urlaub' },
  { key: 'provisions_overtime', label: 'Überstunden' },
  { key: 'provisions_bonuses', label: 'Bonuszahlungen' },
  { key: 'provisions_other_personnel', label: 'Sonstige Personalkosten' },
  { key: 'provisions_audit_costs', label: 'Jahresabschluss und -prüfung' },
  { key: 'provisions_outstanding_invoices', label: 'Ausstehende Rechnungen' },
];

const MATURITY_ITEMS = [
  { slug: 'bank', total: 'bank_liabilities' },
  { slug: 'advance_payments', total: 'advance_payments_received' },
  { slug: 'trade_payables', total: 'trade_payables' },
  { slug: 'unused_grants', total: 'unused_grants_liabilities' },
  { slug: 'other_liabilities', total: 'other_liabilities' },
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
  const labelOf = useMemo(() => new Map(dataset.facts.map((f) => [f.key, f.labelDe])), [dataset]);
  const allYears = useMemo(() => sortedPeriods(dataset).map((p) => p.id), [dataset]);

  const assetYears = useChartYears(allYears);
  const [assetType, setAssetType] = useState<ChartType>('bar');
  const liabilityYears = useChartYears(allYears);
  const [liabilityType, setLiabilityType] = useState<ChartType>('bar');
  const provisionYears = useChartYears(allYears);
  const [provisionType, setProvisionType] = useState<ChartType>('bar');

  const assetsModel = useMemo(
    () => buildStackedModel(dataset, ASSET_PARTS, assetYears.years),
    [dataset, assetYears.years],
  );
  const liabilitiesModel = useMemo(
    () => buildStackedModel(dataset, LIABILITY_PARTS, liabilityYears.years),
    [dataset, liabilityYears.years],
  );
  const provisionsModel = useMemo(
    () => buildGroupedModel(dataset, PROVISION_ITEMS, 'TEUR', provisionYears.years),
    [dataset, provisionYears.years],
  );

  if (!ctx) return null;
  const { currentId, previousId, value } = ctx;
  const prevLabel = previousId ?? '';
  const amount = (key: string, period: string | null) => {
    const v = value(key, period);
    return v === null ? '–' : formatAmount(v);
  };

  const assetRows = buildStatementRows(dataset, 'balance_assets', currentId, previousId);
  const liabilityRows = buildStatementRows(dataset, 'balance_liabilities', currentId, previousId);

  const rollForward = (
    title: string,
    items: { key: string; label: string; kind?: DataTableRow['kind']; optional?: boolean }[],
  ) => (
    <section className="card">
      <DataTable
        title={title}
        subtitle={de.table.amountsInEur}
        columns={[currentId, prevLabel]}
        rows={items
          .filter((item) => !item.optional || [currentId, previousId].some((p) => (value(item.key, p) ?? 0) !== 0))
          .map((item) => ({
          key: item.key,
          label: item.label,
          kind: item.kind,
          cells: [amount(item.key, currentId), amount(item.key, previousId)],
        }))}
      />
    </section>
  );

  const maturityKnown = value('maturity_trade_payables_lt1y', currentId) !== null;
  const hasAmount = (key: string) =>
    [currentId, previousId].some((p) => {
      const v = value(key, p);
      return v !== null && v !== 0;
    });
  // The bank line only appears in years in which there was a bank loan.
  const maturityItems = MATURITY_ITEMS.filter((item) => item.slug !== 'bank' || hasAmount('bank_liabilities'));
  const maturityRows: DataTableRow[] = maturityItems.map(({ slug, total }) => ({
    key: slug,
    label: labelOf.get(total) ?? slug,
    cells: ['lt1y', 'gt1y', 'gt5y'].map((bucket) => (
      <AmountWithPrior
        key={bucket}
        current={value(`maturity_${slug}_${bucket}`, currentId)}
        previous={value(`maturity_${slug}_${bucket}`, previousId)}
      />
    )).concat([<AmountWithPrior key="total" current={value(total, currentId)} previous={value(total, previousId)} />]),
  }));
  const sumOf = (suffix: string, period: string | null): number | null => {
    const parts = maturityItems.map(({ slug }) => value(`maturity_${slug}_${suffix}`, period));
    return parts.some((p) => p === null) ? null : parts.reduce<number>((a, b) => a + (b ?? 0), 0);
  };
  maturityRows.push({
    key: 'total',
    label: de.balance.maturityTotal,
    kind: 'total',
    cells: ['lt1y', 'gt1y', 'gt5y'].map((bucket) => (
      <AmountWithPrior key={bucket} current={sumOf(bucket, currentId)} previous={sumOf(bucket, previousId)} />
    )).concat([
      <AmountWithPrior
        key="total"
        current={value('liabilities_total', currentId)}
        previous={value('liabilities_total', previousId)}
      />,
    ]),
  });

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

      <section className="anhang" aria-labelledby="balance-anhang-title">
        <h2 id="balance-anhang-title" className="anhang-title">
          {de.balance.anhangTitle} <span className="muted">· {de.balance.anhangSource}</span>
        </h2>

        <div className="grid-2">
          {rollForward(de.balance.capitalReserveTitle, [
            { key: 'capital_reserve_opening', label: de.balance.rollForward.opening },
            { key: 'capital_reserve_addition', label: de.balance.rollForward.addition },
            { key: 'capital_reserve_loss_offset', label: de.balance.rollForward.lossOffset },
            { key: 'capital_reserve_closing', label: de.balance.rollForward.closing, kind: 'total' },
          ])}
          {rollForward(de.balance.specialItemTitle, [
            { key: 'special_item_opening', label: de.balance.rollForward.opening },
            { key: 'special_item_addition', label: de.balance.rollForward.addition },
            { key: 'special_item_correction', label: de.balance.rollForward.correction, optional: true },
            { key: 'special_item_release', label: de.balance.rollForward.release },
            { key: 'special_item_closing', label: de.balance.rollForward.closing, kind: 'total' },
          ])}
        </div>

        {provisionsModel && (
          <GroupedBarChart
            id="provisions"
            title={de.balance.provisionsTitle}
            subtitle={`${de.balance.provisionsSubtitle} ${de.balance.provisionsBalance}: ${
              value('provisions_total', currentId) === null ? '–' : formatEur(value('provisions_total', currentId) as number)
            } (${prevLabel}: ${
              value('provisions_total', previousId) === null ? '–' : formatEur(value('provisions_total', previousId) as number)
            }).`}
            model={provisionsModel}
            type={provisionType}
            controls={
              <ChartControls
                periods={allYears}
                range={provisionYears.range}
                onRangeChange={provisionYears.setRange}
                type={provisionType}
                onTypeChange={setProvisionType}
              />
            }
          />
        )}

        <section className="card">
          {!maturityKnown && <p className="muted">{de.balance.maturityUnavailable}</p>}
          {maturityKnown && <DataTable
            title={de.balance.maturityTitle}
            subtitle={de.balance.maturitySubtitle(periodEnd(dataset, currentId).slice(-4))}
            labelHeader={de.balance.maturityColumns.item}
            columns={[
              de.balance.maturityColumns.lt1y,
              de.balance.maturityColumns.gt1y,
              de.balance.maturityColumns.gt5y,
              de.balance.maturityColumns.total,
            ]}
            rows={maturityRows}
          />}
        </section>

        <NoteList title={de.balance.notesTitle} notes={viewNotes} />
        <Redactions items={redactions} />
      </section>

      <ValidationPanel report={report} periods={periods} tolerance={dataset.conventions.tolerance ?? DEFAULT_TOLERANCE} />
    </>
  );
}

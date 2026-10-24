import { existsSync, readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseDataset } from './dataset';
import { reportForView, validateDataset } from './validate';
import { IncomeView } from '../views/IncomeView';
import { BalanceView } from '../views/BalanceView';
import { AnlagespiegelView } from '../views/AnlagespiegelView';
import { ChartControls } from '../components/ChartControls';

const DATA_DIR = new URL('../../public/data/', import.meta.url);
const load = (file: string) => parseDataset(JSON.parse(readFileSync(new URL(file, DATA_DIR), 'utf-8')));

// The pilot datasets are git-ignored; the smoke tests run only where they exist.
const DATASETS = ['demo.json', 'fgk-2024.json', 'fgk.json', 'ifos.json', 'time.json', 'fgk-auto.json'].filter((file) =>
  existsSync(new URL(file, DATA_DIR)),
);

describe('view smoke render', () => {
  for (const file of DATASETS) {
    it(`renders income and balance for ${file}`, () => {
      const dataset = load(file);
      const report = validateDataset(dataset);
      const periodId = dataset.periods[dataset.periods.length - 1].id;
      const income = renderToString(
        <IncomeView dataset={dataset} periodId={periodId} report={reportForView(report, 'income')} />,
      );
      const balance = renderToString(
        <BalanceView dataset={dataset} periodId={periodId} report={reportForView(report, 'balance')} />,
      );

      // Year slider and bar/line switch on the comparison charts.
      expect(income).toContain('chart-toolbar');
      expect(balance).toContain('chart-toolbar');
      expect((income.match(/chart-toolbar/g) ?? []).length).toBeGreaterThanOrEqual(2);
      expect((balance.match(/chart-toolbar/g) ?? []).length).toBeGreaterThanOrEqual(3);

      // Figures the dashboard does not show: auditor fee, Anlagenspiegel.
      expect(income).not.toContain('Abschlussprüfer');
      expect(balance).not.toContain('Anlagenspiegel');

      if (file !== 'demo.json') {
        // The demo dataset has its own fact keys and never showed these sections.
        // "Weitere Angaben" start folded away, where the dataset has any.
        if ((dataset.notes?.length ?? 0) > 0) {
          expect(income).toContain('<details class="card collapsible">');
          expect(balance).toContain('<details class="card collapsible">');
        }
        // Statements start collapsed: the A./B./C./D. rows show their chevrons closed.
        expect(income).toContain('aria-expanded="false"');
        expect(balance).toContain('aria-expanded="false"');
        expect(income).toContain('Personalaufwand im Verhältnis zum Umsatz');
        expect(income).not.toContain('Beschäftigte');
      }
    });

    it(`renders the Anlagespiegel for ${file}`, () => {
      const dataset = load(file);
      if (!dataset.schedules?.length) return;
      const report = validateDataset(dataset);
      const periodId = dataset.periods[dataset.periods.length - 1].id;
      const html = renderToString(
        <AnlagespiegelView dataset={dataset} periodId={periodId} report={reportForView(report, 'anlagespiegel')} />,
      );
      expect(html).toContain('Anlagespiegel');
      // Every printed column of the schedule shows up as a table header.
      for (const column of dataset.schedules[0].columns) {
        expect(html).toContain(column.labelDe);
      }
    });
  }
});

describe('chart controls', () => {
  it('names both slider handles and keeps them apart on a single year', () => {
    const single = renderToString(
      <ChartControls
        periods={['2022', '2023', '2024']}
        range={{ from: 2, to: 2 }}
        onRangeChange={() => {}}
        type="bar"
        onTypeChange={() => {}}
      />,
    );
    expect(single).toContain('data-same="true"');
    expect(single).toContain('aria-label="von"');
    expect(single).toContain('aria-label="bis"');

    const range = renderToString(
      <ChartControls
        periods={['2022', '2023', '2024']}
        range={{ from: 1, to: 2 }}
        onRangeChange={() => {}}
        type="bar"
        onTypeChange={() => {}}
      />,
    );
    expect(range).not.toContain('data-same');
    expect(range).toContain('2023 – 2024');
  });
});

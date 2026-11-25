# report-monitor

*(working title; the dashboard UI itself is titled "Kennzahlen-Dashboard")*

A local-first, browser-only dashboard for the key figures of companies, starting with state-owned
enterprises such as research institutes. The UI is in German; code and documentation are in English.

**Pilot:** annual accounts published as PDFs on a government open data portal. **No data is part of this
repository** – without an uploaded dataset the dashboard shows the full statement structure with every figure
as "–", and you load your own files through "Daten hochladen".

## Status

Phase 1 (display) and the upload frame. With a loaded dataset, two dropdowns in the upper right select the view
and the fiscal year. Both are kept in the URL (`#/balance/2021`, `#/income/2024`).
Each view has a multi-year trend chart with a table twin.

Companies that changed their name can store earlier names in `entity.formerNames`; the dashboard always shows
the current one. Lines that only exist in some years' layouts (e.g. Verlustvortrag from 2021) are handled with
`absentIn` / `layouts` per fact.

- **Bilanz** (Anlage 1)
  - KPI cards: Bilanzsumme, Anlagevermögen, Eigenkapitalquote, liquide Mittel
  - structure of Aktiva and Passiva for both years (stacked bars)
  - the complete Aktiva and Passiva as tables in the § 266 HGB structure (with "B. Sonderposten" on the
    liabilities side; printed designations as tooltips), both years and the change; rows with sub-items can
    be collapsed. The "Anzeige nach §266 HGB" checkbox switches between the full catalogue of posts (empty
    ones included) and only the rows that carry figures
- **Gewinn- und Verlustrechnung** (Anlage 2)
  - KPI cards: Umsatzerlöse, Jahresfehlbetrag, Personalaufwand, Personalaufwand im Verhältnis zum Umsatz
  - comparison chart of the main income statement items
  - the complete income statement as a table
- **Analyse** (app-defined, offered for every dataset – see [Analysis view](#analysis-view-analyse))
  - key figures per year (equity ratio, debt ratio, coverage, liquidity 1.–3. grade, margins, returns) with
    formula, source positions and missing-input tooltips per year
  - time series of chosen positions: absolute / index (base year = 100) / change vs. prior year, table with
    year-over-year change, CAGR and outlier flags
  - a plausibility status block (green/amber/red) with expandable findings, and CSV/PNG export
- each view shows the plausibility checks that belong to it; figures a company's layout does not have are left out
  (the Bilanz keeps the § 266 posts as empty rows instead, see the "Anzeige nach §266 HGB" checkbox)
- light and dark mode (follows the OS setting, or set `data-theme="light|dark"` on `<html>`)

### Upload frame (CSV, XLSX, JSON)

"Daten hochladen" (`#/upload`) loads your own figures. Everything happens in the browser; the file is never sent
anywhere and the result is kept in the browser's IndexedDB (a "Datenquelle" dropdown appears once something is loaded).

1. Drop or choose files: `.csv` (`;` `,` tab or `|`; UTF-8 or Windows-1252), `.xlsx` (every sheet is offered) or `.json`.
   Several files can be dropped at once.
2. A **JSON file in the dataset format** (schema 0.4, or the older 0.2/0.3) is recognized, validated
   with its own checks and imported as is. Other JSON (a list of rows, or `{ "Umsatz": { "2023": 1 } }`) is treated
   like a table.
3. A **report extract** (`{ "source_url": …, "pages": [{ "text": … }] }`, the `*_extracted.json` files of the
   extraction tooling) is read as the PDF text layer: Bilanz and Gewinn- und Verlustrechnung are recognised
   by label. Several extracts (one file per year of the
   same company) are merged into one multi-year dataset; the report of a year is the reference for that year, its
   prior-year column fills gaps and differing figures are reported.
4. For a **table** the app guesses the header row, the label column and the year columns (headers such as `2023`,
   `GJ 2023`) and shows the file excerpt; each guess can be corrected (wide layout: one row per item, one column
   per year; long layout: item / year / value). Unit and number notation (`1.234,56` or `1,234.56`, auto-detected) are
   selectable. Warnings name what was skipped or overwritten; errors block the import.
5. The result is shown as a generic **Daten** view: first figures with year-on-year change, a chart of up to four
   chosen items with a table twin, and the complete table. Uploaded tables have no reconciliation checks.

Limits: 15 MB per file, 50,000 rows, years only (no quarters), one unit per table upload, no `.xls`. The old `.xls`
format and PDF files are rejected with a message.

Not built yet: cross-company analytics, the Anhang views (accounting methods, Angaben zur Bilanz, Erläuterungen zur GuV,
management and supervisory board) and the Corporate Governance Bericht.

## Quick start

Requires Node.js 20 or newer.

```bash
npm install
npm run dev        # development server
npm test           # unit tests (Vitest)
npm run typecheck  # TypeScript
npm run build      # type check + production build into dist/
npm run preview    # serve the production build locally

# build data/*.json from the report extracts in data/single-data/ (Node.js 22+);
# the files are git-ignored and loaded per upload in the dashboard
npm run generate:datasets
```

The production build is a static site (relative base path) and can be hosted anywhere.

## Hosting (GitHub Pages)

1. Repo → Settings → Pages → Build and deployment → Source: **GitHub Actions** (one-time setting).
2. Push to `main` – `.github/workflows/deploy.yml` runs the tests, builds `dist/` and publishes it to
   GitHub Pages. The deployment URL shows at the end of the workflow run.

The hosted site contains no data at all: it starts with the empty structure (all boxes, every figure "–").
Datasets are git-ignored and never reach the published build. To work with your own figures on the hosted site,
load them through "Daten hochladen" in the browser – they stay in that browser's storage.

## Privacy

Everything runs in the browser. There is no backend, and no data leaves the machine. Uploaded files are read
locally and kept in the browser's IndexedDB
only (plus `localStorage` for the active source). That storage is per browser and per device: clearing
the site data or switching browsers or devices means uploading the files again.

## Project structure

```
data/                        datasets you generated (git-ignored) – load them per upload
data/single-data/            report extracts (*_extracted.json), one folder per company
src/types.ts                  dataset format
src/lib/expression.ts         safe parser/evaluator for the formulas inside datasets (no eval)
src/lib/formula.ts            evaluates a formula for one period, reports missing data explicitly
src/lib/validate.ts           runs all reconciliation checks; splits the report by view
src/lib/dataset.ts            runtime shape check, value lookup, period helpers
src/lib/emptyDataset.ts       the dataset behind the empty start view: every figure null
src/lib/statementRows.ts      rows of a statement table (numbering, hierarchy, printed values, change)
src/lib/balanceLayout.ts      § 266 HGB skeleton of the Bilanz (Aktiva/Passiva) and the mapping of fact keys
src/lib/kpiCards.ts           headline KPIs per view and their change against the previous period
src/lib/grouped.ts            models for the grouped and the stacked bar charts
src/lib/extract/              report extracts (*_extracted.json) -> dataset: numbers.ts, rows.ts, detect.ts,
                              statements.ts (Bilanz/GuV by label),
                              buildDataset.ts (one or more reports -> multi-year dataset)
src/lib/upload/               upload frame: csv.ts, numbers.ts, readFile.ts (csv/xlsx/json/extract), mapping.ts (table -> dataset),
                              entityMatch.ts, merge.ts, storage.ts (IndexedDB), renderable.ts (generic view fallback)
src/lib/genericView.ts        cards and chart model of the generic "Daten" view
src/lib/format.ts             German number formatting (Intl)
src/lib/download.ts           browser download helpers (CSV text, chart PNG)
src/analysis/                 pure analysis functions (no React): metrics.ts (key figures), timeseries.ts
                              (YoY, CAGR, index, outliers), validation.ts (plausibility checks),
                              export.ts (metrics CSV), types.ts – each with Vitest tests beside it
src/i18n/de.ts                all user-visible strings that are not part of the data
scripts/generate-datasets.ts  builds data/*.json from the report extracts in data/single-data/
src/components/               ViewSelect, PeriodSelect, StatementTable, DataTable, KpiCard, ValidationPanel, RedactionNote,
                              UploadPage, MappingForm, SourceSelect, ErrorBoundary, ChartControls, useChartYears,
                              GroupedBarChart, StackedBarChart, TrendChart (ECharts, shared setup in chartTheme.ts),
                              MetricTable, AnalysisTimeSeries, AnalysisChecks, AnalysisExport (Analyse view)
src/views/                    BalanceView, IncomeView, AnalysisView, DataView (what each dropdown entry shows)
```

## Dataset format

A dataset (schema version 0.4) is one JSON file:

- `entity`, `sources`: who the figures belong to (incl. `formerNames`) and the report each year comes from
- `periods`: fiscal years, e.g. `{ "id": "2024", "start": "2024-01-01", "end": "2024-12-31" }`
- `statements` and `views`: the statements (Aktiva, Passiva, GuV) and the selectable views that group them.
  The dropdown is built from `views`; a view id needs a matching component in `src/App.tsx`.
- `facts`: one entry per reported figure, with a value for every period:

  ```json
  { "key": "revenue", "statement": "income", "labelDe": "Umsatzerlöse", "numberLabel": "1.", "unit": "EUR",
    "values": { "2024": 2074189.84, "2023": 1766053.0 } }
  ```

  - `parentKey` expresses the hierarchy of the statement, `absentIn` lists years whose layout has no such line, `layouts` overrides label/number/sign per year.
  - `numberLabel` is the position number as printed ("A.", "II.", "1.", "a)").
  - `emphasis` (`total`, `subtotal`, `memo`) controls how a row is drawn; `memo` rows are "davon ..." lines.
  - `printSign: -1` marks lines whose printed sign differs from the stored economic sign (see below).
  - A value of `null` means "not printed or redacted in the source" and is never treated as zero.
- `derivedKpis`: formulas over fact keys, e.g. `equity_total / total_assets`. `revenue[prev]` is the value of the
  previous period.
- `checks`: reconciliation rules `lhs = rhs`, each assigned to the `views` in which it is shown, e.g.
  `fixed_assets_total + current_assets_total + prepaid_expenses` = `total_assets`
- `notes`: remarks from the Anhang, shown as text in the Daten view
- `redactions`: things the source blacks out or omits (`kind`: `redacted` | `missing`; optional `periods`), shown as a notice in the Daten view instead of being left out

Units: `EUR`, `TEUR` (thousand euros), `count`, `pct` (88.9 means 88.9 %) and `ratio` (0.269 means 26.9 %).

Sign conventions: balance sheet items and income statement lines are stored as printed (expenses as positive
cost amounts). Results (`net_result`) use the economic sign, so a loss is negative. Two income statement lines are
printed with the opposite sign ("Verminderung des Bestandes" and the "Jahresfehlbetrag" as a positive loss) and carry
`printSign: -1`: the tables show them as printed, the checks and KPIs use the economic value. A relative change is
not shown when the sign flips between the years.

## Validation

Datasets will later come from uploaded files, so their formulas are untrusted input. They are parsed
into an AST by a small hand-written parser (numbers, identifiers, `+ - * /`, parentheses, `[prev]`) and
never run through `eval` or `new Function`.

Each check is evaluated for every period within the tolerance given in `conventions.tolerance`
(default 0.01 EUR). The result is one of:

- **pass**: both sides agree
- **fail**: the sides differ, a key is unknown, or the formula is invalid
- **skipped**: an input value is missing (`null`) or there is no previous period

## Analysis view (Analyse)

The **Analyse** dropdown entry (next to Bilanz and GuV) computes key figures, time series and plausibility
checks over *all* periods of the loaded dataset. It is app-defined (not part of the dataset schema) and offered
for every dataset, including older stored ones. The pure functions live in `src/analysis/` and are unit-tested
with Vitest; all computation happens in the browser.

### Kennzahlen (key figures)

Every metric is a ratio computed per year from the reported line items. Values are shown per year; the
expandable "Berechnung" row lists the formula, documented approximations and the source positions with their
values per year.

| Kennzahl | Calculation | Source positions |
| --- | --- | --- |
| Eigenkapitalquote | `Eigenkapital / Bilanzsumme` | `equity_total`, `total_assets` |
| Verschuldungsgrad | `(Bilanzsumme − Eigenkapital) / Eigenkapital` | `total_assets`, `equity_total` |
| Anlagendeckungsgrad (statisch) | `Eigenkapital / Anlagevermögen` | `equity_total`, `fixed_assets_total` |
| Liquidität 1. Grades | `(liquide Mittel) / kurzfristiges Fremdkapital` | `cash`, `securities_current_total`¹, debt proxy |
| Liquidität 2. Grades | `(liquide Mittel + Forderungen) / kurzfristiges Fremdkapital` | + `receivables_total` |
| Liquidität 3. Grades | `Umlaufvermögen / kurzfristiges Fremdkapital` | `current_assets_total`, debt proxy |
| EBIT-Marge | `EBIT / Gesamtleistung` | `operating_result` or `result_after_taxes` + `income_taxes` − `financial_result` or `net_result` + `interest_expense` − `interest_income`; `total_performance` (or `revenue`) |
| Jahresergebnis-Marge | `Jahresergebnis / Gesamtleistung` | `net_result`, `total_performance` (or `revenue`) |
| Personalaufwandsquote | `Personalaufwand / Gesamtleistung` | `personnel_expenses_total`, `total_performance` (or `revenue`) |
| Materialaufwandsquote | `Materialaufwand / Gesamtleistung` | `material_expenses_total`, `total_performance` (or `revenue`) |
| Eigenkapitalrentabilität | `Jahresergebnis / Eigenkapital` | `net_result`, `equity_total` |
| Gesamtkapitalrentabilität | `(Jahresergebnis + Zinsaufwand) / Bilanzsumme` | `net_result`, `interest_expense`¹, `total_assets` |

Documented approximations (also shown in the UI under each formula):

- **Short-term debt proxy**: the dataset carries no maturity structure for provisions and liabilities, so
  `kurzfristiges Fremdkapital = Bilanzsumme − Eigenkapital − Pensionsrückstellungen`. The three liquidity
  grades use this denominator.
- **Anlagendeckungsgrad** is the *static* variant (`Eigenkapital / Anlagevermögen`); the classic grade I
  (equity + long-term debt) is not derivable without maturity data.
- **EBIT** is not a printed line in the Gesamtkostenverfahren: the printed `operating_result`
  (Betriebsergebnis) is used, otherwise EBIT is derived from the GuV chain
  (`result_after_taxes + income_taxes − financial_result`), otherwise from the interest lines
  (`net_result + interest_expense − interest_income`, without the tax shield). The derivation actually
  used per year is listed in the "Berechnung" details.
- **Gesamtkapitalrentabilität** is simplified without the tax shield of the interest expense.
- **Margins** use the **Gesamtleistung** (`total_performance`) as denominator; many smaller statements do
  not print one, so the **Umsatzerlöse** (`revenue`) is used as the fallback base (disclosed per year in the
  "Berechnung" details).

Missing input handling: a required position without a value for a year makes the metric `n/a` for that year
(tooltip lists the missing positions) – it is never silently treated as 0. Optional additive components
(marked ¹ above: `securities_current_total`, `interest_expense`, `interest_income`, `pension_provisions`)
count as 0 when the report does not disclose them and are listed in the "Berechnung" details as
"nicht ausgewiesen → 0 angesetzt".

### Zeitreihen

Positions to plot are chosen in a multi-select grouped into Bilanz and GuV (up to six at once). The line
chart (with an accessible table twin) has three modes: absolute values, an index with a selectable base year
(base = 100) and the change against the previous year in %. The table below shows the values per year, the
year-over-year change (absolute and %) and the CAGR over the full period (n/a when an endpoint is not
positive). Values far from the series mean are flagged with ▲: a point is an outlier when it deviates by at
least 2 standard deviations (z-score; constant `OUTLIER_Z_THRESHOLD` in `src/analysis/timeseries.ts`, at
least three values needed).

### Prüfstatus

A compact green/amber/red block at the top with an expandable list of findings (German):

- **Balance identity**: Aktiva = Passiva per year, and Jahresergebnis of the GuV = the balance sheet's
  `net_result_balance`, within `conventions.tolerance` (default 0.01).
- **Sub-totals**: each group total equals the sum of its components (e.g. Anlagevermögen = immaterielle + Sach-
  + Finanzanlagen, Umlaufvermögen, Eigenkapital composition, Verbindlichkeiten, Material-/Personalaufwand,
  the GuV chain up to the result after taxes). A position the company never prints counts as 0; a position
  without a value for the year makes that check "nicht prüfbar" (a missing figure is a skip, not a zero).
- **Prior-year comparison**: the prior-year column of report N+1 is compared with the own-year values of
  report N; deviations (possible extraction errors or reclassifications) are listed. This check needs the raw
  extracts stored at import (`StoredDataset.reports`); datasets imported at value level show it as
  "nicht prüfbar".

Status rule: red when a check fails, amber when there are deviations or nothing was testable, green when
everything passed.

### Export

- **Kennzahlen als CSV**: one row per metric, one column per year, values in percentage points. German
  locale: semicolon separator, decimal comma, UTF-8 with BOM (opens directly in Excel).
- **Diagramm als PNG**: saves the visible time series chart (locally via the ECharts instance, no upload).

## Roadmap

1. **Display** (this version): Bilanz and GuV views with the complete statements, trends, validation.
2. **Upload frame** (done for CSV, XLSX, JSON and report extracts): drag and drop, column mapping, preview, stored in the browser only; several report extracts merge into one multi-year dataset.
3. **PDF extraction**: confirm every recognized value against the page image; per-company extraction profiles.
4. **Analytics**: the Analyse view covers per-company key figures, time series and plausibility checks (this
   version); cross-year / cross-company comparisons are next, probably with DuckDB-WASM.
5. **Other companies and open data**: discover reports through the metadata of the open data portal
   (DCAT-AP.de), then generalize extraction to arbitrary report layouts.

## Data source and license

No data is distributed with this repository. The figures you load come from annual accounts published as PDFs
on open data portals, each under its own license – check the terms and add the required attribution (source,
license, link, and a note on changes) to the footer before a dashboard with real figures is published.

Figures are read from the PDF text layers (OCR where scanned) and are not independently verified. The
reconciliation checks catch typing errors in sums, not wrong values that happen to be consistent.

## Known limitations

- The JavaScript bundle is about 1 MB (315 kB gzipped), mostly ECharts. Fine for now; code splitting
  comes with the analytics phase.
- Which items go into which chart and which KPIs are shown per view is configured in code
  (`src/views/*.tsx`, `src/lib/kpiCards.ts`) for now, not yet in the dataset; views of a dataset whose keys
  are unknown fall back to their own first figures; charts without data are hidden, while the Bilanz tables
  keep the § 266 posts as empty rows (see the "Anzeige nach §266 HGB" checkbox).
- The Aktiva and Passiva tables are stacked, not side by side as in the PDF, so that they also work on a phone.
- The aqua and yellow chart colors have low contrast on the light surface. Every chart therefore has a legend,
  tooltips and a table view with the same numbers.


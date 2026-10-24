# report-monitor

*(working title; the dashboard UI itself is titled "Kennzahlen-Dashboard")*

A local-first, browser-only dashboard for the key figures of companies, starting with state-owned
enterprises such as research institutes. The UI is in German; code and documentation are in English.

**Pilot:** annual accounts of a state-owned research institute, published as PDFs on a government open data
portal. The pilot dataset is **not part of this repository** (see "Data in this repository" below). Without it
the app starts with a small dataset of invented figures and lets you load your own files.

## Status

Phase 1 (display) and the upload frame. With the pilot dataset, two dropdowns in the upper right select the view and the fiscal year (2019–2024; 2018 appears
as the comparison year of the 2019 report). Both are kept in the URL (`#/balance/2021`, `#/income/2024`).
Each view has a multi-year trend chart with a table twin.

Companies that changed their name can store earlier names in `entity.formerNames`; the dashboard always shows
the current one. Lines that only exist in some years' layouts (e.g. Verlustvortrag from 2021) are handled with
`absentIn` / `layouts` per fact.

- **Bilanz** (Anlage 1 and Anhang III "Angaben zur Bilanz")
  - KPI cards: Bilanzsumme, Anlagevermögen, Eigenkapitalquote, liquide Mittel
  - structure of Aktiva and Passiva for both years (stacked bars)
  - the complete Aktiva and Passiva as tables with position numbers, both years and the change; rows with
    sub-items can be collapsed
  - Anhang III: Kapitalrücklage and Sonderposten (roll-forwards), sonstige Rückstellungen, Verbindlichkeitenspiegel,
    remarks
- **Gewinn- und Verlustrechnung** (Anlage 2 and Anhang IV "Erläuterungen zur GuV")
  - KPI cards: Umsatzerlöse, Jahresfehlbetrag, Personalaufwand, Personalaufwand im Verhältnis zum Umsatz
  - comparison chart of the main income statement items
  - the complete income statement as a table
  - Anhang IV directly below it: Umsatzerlöse by activity (chart and table), domestic/foreign split, items from
    other fiscal years
- **Anlagespiegel** (fixed asset schedule of the Anhang) – shown when the dataset has one
  - the full matrix as printed: columns of the cost roll-forward, the accumulated depreciation and the book
    values, grouped under their super-headings; zeros omitted in the source are filled in from the roll-forward
  - Restbuchwert, Zugänge and the year's depreciation as headline figures, a trend of the main items
  - roll-forward checks (AHK and AfA movements, book value = cost − depreciation) in the check panel
  - when the source blacks the schedule out (FGK), the view shows the notice instead of the table
- each view shows the plausibility checks that belong to it; figures a company's layout does not have are left out,
  sections with no data at all are hidden
- light and dark mode (follows the OS setting, or set `data-theme="light|dark"` on `<html>`)

### Upload frame (CSV, XLSX, JSON)

"Daten hochladen" (`#/upload`) loads your own figures. Everything happens in the browser; the file is never sent
anywhere and the result is kept in the browser's IndexedDB (a "Datenquelle" dropdown appears once something is loaded).

1. Drop or choose files: `.csv` (`;` `,` tab or `|`; UTF-8 or Windows-1252), `.xlsx` (every sheet is offered) or `.json`.
   Several files can be dropped at once.
2. A **JSON file in the dataset format** (schema 0.4, or the older 0.2/0.3) is recognized, validated
   with its own checks and imported as is. Other JSON (a list of rows, or `{ "Umsatz": { "2023": 1 } }`) is treated
   like a table.
3. A **report extract** (`{ "source_url": …, "pages": [{ "text": … }] }`, the `*_extracted.json` files of the pilot
   tooling) is read as the PDF text layer: Bilanz, Gewinn- und Verlustrechnung and the Anlagespiegel are recognised
   by label, the Anlagespiegel columns by their roll-forward identities. Several extracts (one file per year of the
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

Not built yet: analytics, Anhang I/II (accounting methods), Anhang V (management, supervisory board) and the
Corporate Governance Bericht are not part of the pilot.

## Quick start

Requires Node.js 20 or newer.

```bash
npm install
npm run dev        # development server
npm test           # unit tests (Vitest)
npm run typecheck  # TypeScript
npm run build      # type check + production build into dist/
npm run preview    # serve the production build locally

# rebuild public/data/{ifos,time,fgk-auto}.json from the report extracts
# (needs the *_extracted.json files in private-data/ and Node.js 22+)
npm run generate:datasets
```

The production build is a static site (relative base path) and can be hosted anywhere.

## Hosting (GitHub Pages)

1. Repo → Settings → Pages → Build and deployment → Source: **GitHub Actions** (one-time setting).
2. Push to `main` – `.github/workflows/deploy.yml` runs the tests, builds `dist/` and publishes it to
   GitHub Pages. The deployment URL shows at the end of the workflow run.

The hosted site shows the bundled demo dataset. The pilot dataset is git-ignored and never reaches the
published build. To work with your own figures on the hosted site, load them through "Daten hochladen"
in the browser – they stay in that browser's storage.

## Privacy

Everything runs in the browser. There is no backend, and no data leaves the machine. The dataset is a
static file served next to the app. Uploaded files are read locally and kept in the browser's IndexedDB
only (plus `localStorage` for the active source). That storage is per browser and per device: clearing
the site data or switching browsers or devices means uploading the files again.

## Project structure

```
public/data/demo.json         invented demo dataset (schema 0.4), bundled
src/types.ts                  dataset format
src/lib/expression.ts         safe parser/evaluator for the formulas inside datasets (no eval)
src/lib/formula.ts            evaluates a formula for one period, reports missing data explicitly
src/lib/validate.ts           runs all reconciliation checks; splits the report by view; roll-forward checks of schedules
src/lib/dataset.ts            runtime shape check, value lookup, period helpers
src/lib/statementRows.ts      rows of a statement table (numbering, hierarchy, printed values, change)
src/lib/kpiCards.ts           headline KPIs per view and their change against the previous period
src/lib/grouped.ts            models for the grouped and the stacked bar charts
src/lib/extract/              report extracts (*_extracted.json) -> dataset: numbers.ts, rows.ts, detect.ts,
                              statements.ts (Bilanz/GuV by label), anlagespiegel.ts (matrix + roll-forward solver),
                              buildDataset.ts (one or more reports -> multi-year dataset)
src/lib/upload/               upload frame: csv.ts, numbers.ts, readFile.ts (csv/xlsx/json/extract), mapping.ts (table -> dataset),
                              storage.ts (IndexedDB), renderable.ts (generic view fallback)
src/lib/genericView.ts        cards and chart model of the generic "Daten" view
src/lib/format.ts             German number formatting (Intl)
src/i18n/de.ts                all user-visible strings that are not part of the data
scripts/generate-datasets.ts  builds public/data/*.json from the report extracts in private-data/
src/components/               ViewSelect, StatementTable, DataTable, KpiCard, ValidationPanel, RedactionNote,
                              UploadPage, MappingForm, SourceSelect, ErrorBoundary,
                              GroupedBarChart, StackedBarChart, TrendChart (ECharts, shared setup in chartTheme.ts)
src/views/                    BalanceView, IncomeView, AnlagespiegelView, DataView (what each dropdown entry shows)
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
- `schedules` (optional): reported matrices such as the Anlagespiegel — rows × columns per period. The column
  `role` (`cost-start`, `additions`, `disposals`, `transfers`, `cost-end`, `accdep-start`, `dep-expense`,
  `dep-disposals`, `dep-transfers`, `accdep-end`, `write-ups`, `book-value`, `book-value-prior`) names the column
  for the roll-forward checks; the printed labels differ per company. Rows store one value map per period, keyed by
  column key. A view lists its schedules in `schedules` beside its `statements`.
- `checks`: reconciliation rules `lhs = rhs`, each assigned to the `views` in which it is shown, e.g.
  `fixed_assets_total + current_assets_total + prepaid_expenses` = `total_assets`
- `notes`: remarks from the Anhang that are shown as text, per view
- `redactions`: things the source blacks out or omits (`kind`: `redacted` | `missing`; optional `periods`), shown as a notice in their view instead of being left out

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

## Roadmap

1. **Display** (this version): Bilanz and GuV views for 2019-2024 with the complete statements, Anhang III/IV, trends, validation.
2. **Upload frame** (done for CSV, XLSX, JSON and report extracts): drag and drop, column mapping, preview, stored in the browser only; several report extracts merge into one multi-year dataset.
3. **Anlagespiegel** (this version): the fixed asset schedule as a view of its own, read from the report extract or from the dataset's `schedules`.
4. **PDF extraction**: confirm every recognized value against the page image; per-company extraction profiles beyond the three pilot companies.
5. **Analytics**: statistical charts and cross-year / cross-company comparisons, probably with DuckDB-WASM.
6. **Other companies and open data**: discover reports through the metadata of the open data portal
   (DCAT-AP.de), then generalize extraction to arbitrary report layouts.

## Data source and license

Source of the pilot data (not distributed with this repository): the annual accounts 2019-2024 (balance sheet,
income statement, notes) of the pilot company, published as PDFs on a government open data portal under the
*Datenlizenz Deutschland - Namensnennung - Version 2.0*. The license requires attribution (source, license,
link, and a note on changes). Add the full attribution to the footer before the dashboard is published.

The figures were transcribed by hand from the PDF; they are not independently verified. The reconciliation
checks catch typing errors in sums, not wrong values that happen to be consistent.

## Known limitations

- The JavaScript bundle is about 750 kB (250 kB gzipped), mostly ECharts. Fine for now; code splitting
  comes with the analytics phase.
- Which items go into which chart and which KPIs are shown per view is configured in code
  (`src/views/*.tsx`, `src/lib/kpiCards.ts`) for the pilot, not yet in the dataset; views of a dataset whose keys
  are unknown fall back to their own first figures and hide sections without data.
- The Anlagenspiegel and the auditor fee are redacted in the published FGK PDF; both are then not shown in the
  dashboard. The ifos and TIME reports print the Anlagespiegel in full.
- The Aktiva and Passiva tables are stacked, not side by side as in the PDF, so that they also work on a phone.
- The aqua and yellow chart colors have low contrast on the light surface. Every chart therefore has a legend,
  tooltips and a table view with the same numbers.

## Data quality

The figures of 2019-2022 were read from the PDF text layers (OCR where scanned) and partly entered by hand; they
are cross-checked by the reconciliation checks and by comparing prior-year columns of consecutive reports, but not
independently verified. Known gaps: the Anlagenspiegel page is missing from the 2019-2022 PDFs and redacted in 2024;
the 2020 report states a 100 % domestic revenue share while the 2021 report gives 91 / 9 % for 2020 (own-report value
kept, noted in the dataset); headcount for 2018/2019 is unknown.

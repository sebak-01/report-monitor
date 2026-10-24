/**
 * Builds data/*.json from the report extracts in private-data/.
 *
 *   node --experimental-transform-types scripts/generate-datasets.ts private-data data
 *
 * The output is git-ignored and never part of the build; load the files through
 * "Daten hochladen" in the dashboard. One dataset per company folder (FGK,
 * ifos, TIME), one report extract per year. The same parser the browser uses
 * reads the extracts; the dashboard's reconciliation checks validate the result.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

// Extensionless relative imports of the TypeScript sources.
register(pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), 'ts-resolver.mjs')), import.meta.url);

const { buildDataset, parseReport } = await import('../src/lib/extract/buildDataset.ts');
const { looksLikeExtract } = await import('../src/lib/extract/detect.ts');
const { validateDataset } = await import('../src/lib/validate.ts');

const [, , sourceDir = 'private-data', outDir = 'data'] = process.argv;

const OUT_NAME: Record<string, string> = {
  // The curated pilot dataset fgk.json stays untouched; the auto-extract gets
  // its own name for comparison.
  FGK: 'fgk-auto',
  ifos: 'ifos',
  TIME: 'time',
};

function extractFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(dir, name))
    .sort();
}

function main(): void {
  mkdirSync(outDir, { recursive: true });
  for (const company of readdirSync(sourceDir)) {
    const dir = join(sourceDir, company);
    const files = extractFiles(dir);
    if (files.length === 0) continue;

    const reports = [];
    for (const file of files) {
      const json = JSON.parse(readFileSync(file, 'utf-8'));
      if (!looksLikeExtract(json)) {
        console.warn(`  übersprungen (kein Berichts-Extrakt): ${basename(file)}`);
        continue;
      }
      reports.push(parseReport(json, basename(file)));
    }
    if (reports.length === 0) continue;

    const { dataset, warnings } = buildDataset(reports);
    const report = validateDataset(dataset);
    const outName = OUT_NAME[company] ?? company.toLowerCase();
    const outFile = join(outDir, `${outName}.json`);
    writeFileSync(outFile, JSON.stringify(dataset, null, 2) + '\n', 'utf-8');

    console.log(`${company} -> ${outFile}  (im Dashboard über „Daten hochladen" laden)`);
    console.log(
      `  ${dataset.facts.length} Positionen, ${dataset.periods.length} Jahre (${dataset.periods.map((p) => p.id).join(', ')}), Anlagespiegel: ${dataset.schedules?.[0]?.rows.length ?? 0} Zeilen`,
    );
    console.log(`  Prüfungen: ${report.passed} bestanden, ${report.failed} fehlgeschlagen, ${report.skipped} übersprungen`);
    for (const result of report.results.filter((r) => r.status === 'fail')) {
      console.log(`   ✗ ${result.labelDe} (${result.period}): ${result.reason?.detail ?? ''}`);
    }
    for (const warning of warnings) console.log(`   ! ${warning}`);
  }
}

if (!existsSync(sourceDir)) {
  console.error(`Ordner nicht gefunden: ${sourceDir}`);
  process.exit(1);
}
main();

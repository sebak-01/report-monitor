/**
 * Builds data/*.json from the report extracts in data/single-data/.
 *
 *   node --experimental-transform-types scripts/generate-datasets.ts data/single-data/
 *
 * The output is git-ignored and never part of the build; load the files through
 * "Daten hochladen" in the dashboard. One dataset per company (fgk, ifos, time),
 * one report extract per year. The same parser the browser uses reads the
 * extracts; the dashboard's reconciliation checks validate the result.
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

const [, , sourceDir = 'data/single-data', outDir = 'data'] = process.argv;

const OUT_NAME: Record<string, string> = {
  // The curated pilot dataset fgk.json is the one to load; the auto-extract is
  // written under its own name so it never overwrites it.
  fgk: 'fgk-auto',
  ifos: 'ifos',
  time: 'time',
};

/** Extracts named "<company>-<year>_extracted.json", grouped per company. */
function companyGroups(dir: string): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const match = /^(.+?)-(\d{4})_extracted\.json$/.exec(name) ?? /^(.+?)-(\d{4})\.json$/.exec(name);
    const company = match ? match[1] : basename(name, '.json');
    groups.set(company, [...(groups.get(company) ?? []), join(dir, name)]);
  }
  return groups;
}

function main(): void {
  mkdirSync(outDir, { recursive: true });
  for (const [company, files] of companyGroups(sourceDir)) {
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
    for (const parsed of reports) {
      for (const warning of parsed.warnings) console.log(`   ! ${parsed.fileName}: ${warning}`);
    }
    for (const warning of warnings) console.log(`   ! ${warning}`);
  }
}

if (!existsSync(sourceDir)) {
  console.error(`Ordner nicht gefunden: ${sourceDir}`);
  process.exit(1);
}
main();

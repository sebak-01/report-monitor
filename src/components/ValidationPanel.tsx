import { de, reasonText } from '../i18n/de';
import { formatEur } from '../lib/format';
import type { CheckResult, ValidationReport } from '../lib/validate';

interface Props {
  report: ValidationReport;
  /** Period ids, newest first. */
  periods: string[];
  tolerance: number;
}

function cellText(result: CheckResult | undefined): string {
  if (!result) return '–';
  switch (result.status) {
    case 'pass':
      return `✓ ${de.validation.pass}`;
    case 'fail':
      return result.diff !== undefined
        ? `✗ ${de.validation.fail} ${formatEur(result.diff)}`
        : `✗ ${result.reason ? reasonText(result.reason) : de.validation.fail}`;
    case 'skipped':
      return `– ${de.validation.skipped}${result.reason ? ` (${reasonText(result.reason)})` : ''}`;
  }
}

export function ValidationPanel({ report, periods, tolerance }: Props) {
  const total = report.results.length;

  // Group results by check, keeping the order of the dataset.
  const byCheck = new Map<string, { label: string; byPeriod: Map<string, CheckResult> }>();
  for (const result of report.results) {
    let entry = byCheck.get(result.checkId);
    if (!entry) {
      entry = { label: result.labelDe, byPeriod: new Map() };
      byCheck.set(result.checkId, entry);
    }
    entry.byPeriod.set(result.period, result);
  }

  return (
    <section className="card" aria-labelledby="validation-title">
      <h2 id="validation-title">{de.validation.title}</h2>
      <p className="card-subtitle">{de.validation.intro}</p>
      <p className={`validation-status validation-status--${report.ok ? 'ok' : 'failed'}`} role="status">
        <span aria-hidden="true">{report.ok ? '✓' : '✗'}</span>{' '}
        {report.ok ? de.validation.allPassed(total) : de.validation.someFailed(report.failed, total)}
        {report.skipped > 0 && <span className="muted"> · {de.validation.skippedNote(report.skipped)}</span>}
      </p>
      <details className="table-view">
        <summary>{de.validation.details}</summary>
        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">{de.validation.columnCheck}</th>
              {periods.map((p) => (
                <th scope="col" key={p}>
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...byCheck.entries()].map(([id, entry]) => (
              <tr key={id}>
                <th scope="row">{entry.label}</th>
                {periods.map((p) => (
                  <td key={p}>{cellText(entry.byPeriod.get(p))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <p className="card-subtitle">{de.validation.tolerance(formatEur(tolerance))}</p>
      </details>
    </section>
  );
}

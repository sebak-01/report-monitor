import { de } from '../i18n/de';
import type { Redaction } from '../types';

/**
 * Marks something the source publishes but blacks out. It is shown instead of
 * being left out, so nobody mistakes the gap for missing work.
 */
export function RedactionNote({ redaction }: { redaction: Redaction }) {
  return (
    <aside className="redaction" aria-label={`${redaction.kind === 'missing' ? de.redaction.missingTitle : de.redaction.title}: ${redaction.labelDe}`}>
      <p className="redaction-title">
        <span className="redaction-mark" aria-hidden="true" />
        {redaction.labelDe}
        <span className="pill">{redaction.kind === 'missing' ? de.redaction.missingTitle : de.redaction.title}</span>
        {redaction.page !== undefined && <span className="muted"> · {de.redaction.page(redaction.page)}</span>}
      </p>
      <p className="redaction-text">{redaction.detailDe}</p>
    </aside>
  );
}

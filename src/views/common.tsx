import { KpiCard } from '../components/KpiCard';
import { appliesTo, createLookup, previousPeriodId, type ValueLookup } from '../lib/dataset';
import type { KpiCardModel } from '../lib/kpiCards';
import type { ValidationReport } from '../lib/validate';
import type { Dataset, Note, Redaction } from '../types';
import { RedactionNote } from '../components/RedactionNote';

export interface ViewProps {
  dataset: Dataset;
  /** The selected Geschäftsjahr. */
  periodId: string;
  /** Validation report restricted to this view. */
  report: ValidationReport;
}

export interface ViewContext {
  currentId: string;
  previousId: string | null;
  lookup: ValueLookup;
  /** Stored value of a fact in a period, `null` when missing. */
  value: (key: string, periodId: string | null) => number | null;
}

/** Common lookups of a view for the selected period. Returns null for an unknown period. */
export function createViewContext(dataset: Dataset, currentId: string): ViewContext | null {
  if (!dataset.periods.some((p) => p.id === currentId)) return null;
  const lookup = createLookup(dataset);
  return {
    currentId,
    previousId: previousPeriodId(dataset, currentId),
    lookup,
    value: (key, periodId) => (periodId === null ? null : (lookup(key, periodId) ?? null)),
  };
}

/** "2024-12-31" -> "31.12.2024" */
export function formatDateDe(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

export function periodEnd(dataset: Dataset, periodId: string): string {
  const period = dataset.periods.find((p) => p.id === periodId);
  return period ? formatDateDe(period.end) : periodId;
}

export function KpiGrid({ label, cards }: { label: string; cards: KpiCardModel[] }) {
  return (
    <section aria-label={label} className="kpi-grid">
      {cards.map((card) => (
        <KpiCard key={card.id} card={card} />
      ))}
    </section>
  );
}

/** Notes of a view, folded away until the heading is clicked. */
export function NoteList({ title, notes }: { title: string; notes: Note[] }) {
  if (notes.length === 0) return null;
  return (
    <details className="card collapsible">
      <summary className="statement-title">{title}</summary>
      <ul className="note-list">
        {notes.map((note) => (
          <li key={note.textDe}>{note.textDe}</li>
        ))}
      </ul>
    </details>
  );
}

/** Notes and redactions of a view that apply to the selected period. */
export function forView<T extends { view: string; periods?: string[] }>(
  items: T[] | undefined,
  viewId: string,
  periodId: string,
): T[] {
  return (items ?? []).filter((item) => item.view === viewId && appliesTo(item, periodId));
}

export function Redactions({ items }: { items: Redaction[] }) {
  return (
    <>
      {items.map((item) => (
        <RedactionNote key={`${item.periods?.join(',')}-${item.page}-${item.labelDe}`} redaction={item} />
      ))}
    </>
  );
}

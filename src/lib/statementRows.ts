import type { Dataset, Emphasis, Fact } from '../types';

export interface StatementRow {
  key: string;
  label: string;
  number: string;
  level: number;
  emphasis?: Emphasis;
  hasChildren: boolean;
  /** Ancestor keys, nearest first. Used to hide rows of collapsed parents. */
  ancestors: string[];
  /** Values as printed in the report (print sign applied). */
  current: number | null;
  previous: number | null;
  deltaAbs: number | null;
  deltaRel: number | null;
  page?: number;
  note?: string;
}

/** Value as printed in the report of `layoutId` (the layout of the viewed report year decides the sign). */
function printed(fact: Fact, periodId: string, layoutId: string): number | null {
  const value = fact.values[periodId];
  if (value === null || value === undefined) return null;
  const sign = fact.layouts?.[layoutId]?.printSign ?? fact.printSign;
  return sign === -1 ? -value : value;
}

/**
 * Rows of one statement for a statement table, in the order of the dataset.
 * Values are shown as printed in the report. The change between the periods
 * is computed from the printed values, so a column never contradicts the row.
 */
export function buildStatementRows(
  dataset: Dataset,
  statementId: string,
  currentId: string,
  previousId: string | null,
): StatementRow[] {
  // Lines the viewed report year does not have are left out.
  const facts = dataset.facts.filter((f) => f.statement === statementId && !f.absentIn?.includes(currentId));
  const byKey = new Map(facts.map((f) => [f.key, f]));
  const parentsWithChildren = new Set(
    facts.filter((f) => f.parentKey && byKey.has(f.parentKey)).map((f) => f.parentKey as string),
  );

  return facts.map((fact) => {
    const ancestors: string[] = [];
    for (let parent = fact.parentKey; parent && byKey.has(parent); parent = byKey.get(parent)?.parentKey) {
      if (ancestors.includes(parent)) break; // defensive: never loop on a malformed hierarchy
      ancestors.push(parent);
    }

    const current = printed(fact, currentId, currentId);
    const previous = previousId === null ? null : printed(fact, previousId, currentId);
    const deltaAbs = current !== null && previous !== null ? current - previous : null;
    // A relative change is only meaningful for the same sign; across a sign flip it is left out.
    const deltaRel =
      current !== null && previous !== null && previous !== 0 && current * previous >= 0
        ? (current - previous) / Math.abs(previous)
        : null;

    return {
      key: fact.key,
      label: fact.layouts?.[currentId]?.labelDe ?? fact.labelDe,
      number: fact.layouts?.[currentId]?.numberLabel ?? fact.numberLabel ?? '',
      level: ancestors.length,
      emphasis: fact.emphasis,
      hasChildren: parentsWithChildren.has(fact.key),
      ancestors,
      current,
      previous,
      deltaAbs,
      deltaRel,
      page: fact.page,
      note: fact.note,
    };
  });
}

/** Keys of all rows that have children, for "expand all / collapse all". */
export function expandableKeys(rows: StatementRow[]): string[] {
  return rows.filter((r) => r.hasChildren).map((r) => r.key);
}

import { BALANCE_LAYOUT, factKeyIndex, type BalanceRowSpec } from './balanceLayout';
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

function change(current: number | null, previous: number | null): { deltaAbs: number | null; deltaRel: number | null } {
  const deltaAbs = current !== null && previous !== null ? current - previous : null;
  // A relative change is only meaningful for the same sign; across a sign flip it is left out.
  const deltaRel =
    current !== null && previous !== null && previous !== 0 && current * previous >= 0
      ? (current - previous) / Math.abs(previous)
      : null;
  return { deltaAbs, deltaRel };
}

/**
 * The facts in tree order: every parent sits above its children (the children
 * in dataset order), so a collapsed row expands downward. Totals the source
 * prints after their items move above them.
 */
function treeOrder(facts: Fact[]): Fact[] {
  const byKey = new Map(facts.map((f) => [f.key, f]));
  const children = new Map<string, Fact[]>();
  const roots: Fact[] = [];
  for (const fact of facts) {
    const parent = fact.parentKey && byKey.has(fact.parentKey) ? fact.parentKey : null;
    if (parent === null) {
      roots.push(fact);
    } else {
      children.set(parent, [...(children.get(parent) ?? []), fact]);
    }
  }
  const ordered: Fact[] = [];
  const seen = new Set<string>();
  const visit = (fact: Fact) => {
    if (seen.has(fact.key)) return; // defensive: never loop on a malformed hierarchy
    seen.add(fact.key);
    ordered.push(fact);
    for (const child of children.get(fact.key) ?? []) visit(child);
  };
  for (const root of roots) visit(root);
  for (const fact of facts) visit(fact); // defensive: cycles end up appended in dataset order
  return ordered;
}

/**
 * Rows of one statement for a statement table, in tree order (parents above
 * their children). Values are shown as printed in the report. The change
 * between the periods is computed from the printed values, so a column never
 * contradicts the row.
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

  return treeOrder(facts).map((fact) => {
    const ancestors: string[] = [];
    for (let parent = fact.parentKey; parent && byKey.has(parent); parent = byKey.get(parent)?.parentKey) {
      if (ancestors.includes(parent)) break; // defensive: never loop on a malformed hierarchy
      ancestors.push(parent);
    }

    const current = printed(fact, currentId, currentId);
    const previous = previousId === null ? null : printed(fact, previousId, currentId);

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
      ...change(current, previous),
      page: fact.page,
      note: fact.note,
    };
  });
}

/**
 * The printed designations of the facts a row is filled from – kept as the
 * tooltip of the § 266 row, whose label and number are the ones of the law.
 */
function printedDesignations(
  spec: BalanceRowSpec,
  facts: Fact[],
  currentId: string,
  previousId: string | null,
): string[] {
  const seen = new Set<string>();
  const printedLabels: string[] = [];
  for (const fact of facts) {
    if (fact.absentIn?.includes(currentId)) continue;
    for (const periodId of [currentId, previousId]) {
      if (periodId === null || fact.absentIn?.includes(periodId)) continue;
      const label = fact.layouts?.[periodId]?.labelDe ?? fact.labelDe;
      const number = fact.layouts?.[periodId]?.numberLabel ?? fact.numberLabel ?? '';
      // Only designations that really differ from the § 266 row are worth a tooltip.
      if (label === spec.labelDe && (number === '' || number === spec.numberLabel)) continue;
      const text = number ? `${number} ${label}` : label;
      if (!seen.has(text)) {
        seen.add(text);
        printedLabels.push(text);
      }
    }
  }
  return printedLabels;
}

/**
 * Rows of the Aktiva or the Passiva in the order, designations and numbering
 * of § 266 HGB (with "B. Sonderposten" on the liabilities side). The dataset
 * fills the rows via `factKeys`; posts no report shows stay empty. Facts the
 * skeleton has no row for are kept under their group so no figure is lost.
 *
 * `includeEmptyRows: false` drops the posts without any figure – parents stay
 * while one of their children shows a figure, so no row is left orphaned.
 */
export function buildBalanceStatementRows(
  dataset: Dataset,
  statementId: 'balance_assets' | 'balance_liabilities',
  currentId: string,
  previousId: string | null,
  options?: { includeEmptyRows?: boolean },
): StatementRow[] {
  const layout = BALANCE_LAYOUT[statementId];
  const facts = dataset.facts.filter((f) => f.statement === statementId);
  const byKey = new Map(facts.map((f) => [f.key, f]));
  const specIndex = factKeyIndex(layout);
  const specByKey = new Map(layout.map((s) => [s.key, s]));
  const hasChildren = new Set(layout.filter((s) => s.parentKey && specByKey.has(s.parentKey)).map((s) => s.parentKey as string));

  const filled = new Set<string>();
  const valueOf = (spec: BalanceRowSpec, periodId: string | null): number | null => {
    if (periodId === null) return null;
    let sum: number | null = null;
    for (const key of spec.factKeys ?? [spec.key]) {
      const fact = byKey.get(key);
      if (!fact) continue;
      // A line the viewed report layout does not have shows no figure at all,
      // not even its stored 0 – and never the previous column alone.
      if (fact.absentIn?.includes(currentId)) continue;
      if (fact.absentIn?.includes(periodId)) continue;
      const value = printed(fact, periodId, currentId);
      if (value === null) continue;
      sum = (sum ?? 0) + value;
    }
    return sum;
  };

  const rows: StatementRow[] = layout.map((spec) => {
    const mapped = (spec.factKeys ?? [spec.key])
      .map((key) => byKey.get(key))
      .filter((fact): fact is Fact => fact !== undefined);
    for (const fact of mapped) filled.add(fact.key);

    const ancestors: string[] = [];
    for (let parent = spec.parentKey; parent && specByKey.has(parent); parent = specByKey.get(parent)?.parentKey) {
      ancestors.push(parent);
    }

    const current = valueOf(spec, currentId);
    const previous = valueOf(spec, previousId);
    const designations = printedDesignations(spec, mapped, currentId, previousId);
    const notes = mapped.map((f) => f.note).filter((n): n is string => n !== undefined && n !== '');
    const tooltip = [
      designations.length > 0 ? `Im Bericht: ${designations.join(' · ')}` : '',
      ...notes,
    ].filter((text) => text !== '');

    return {
      key: spec.key,
      label: spec.labelDe,
      number: spec.numberLabel,
      level: ancestors.length,
      emphasis: spec.emphasis,
      hasChildren: hasChildren.has(spec.key),
      ancestors,
      current,
      previous,
      ...change(current, previous),
      page: mapped[0]?.page,
      note: tooltip.length > 0 ? tooltip.join(' — ') : undefined,
    };
  });

  // Facts without a § 266 row (a hand-written dataset may carry some): shown
  // below their group, never silently dropped.
  for (const fact of facts.filter((f) => !filled.has(f.key))) {
    const ancestors: string[] = [];
    let anchor: StatementRow | undefined;
    for (let parent = fact.parentKey ? byKey.get(fact.parentKey) : undefined; parent; parent = parent.parentKey ? byKey.get(parent.parentKey) : undefined) {
      const spec = specIndex.get(parent.key);
      if (spec) {
        anchor = rows.find((r) => r.key === spec.key);
        break;
      }
      ancestors.push(parent.key);
    }
    const current = printed(fact, currentId, currentId);
    const previous = previousId === null ? null : printed(fact, previousId, currentId);
    const row: StatementRow = {
      key: fact.key,
      label: fact.layouts?.[currentId]?.labelDe ?? fact.labelDe,
      number: fact.layouts?.[currentId]?.numberLabel ?? fact.numberLabel ?? '',
      level: anchor ? anchor.level + 1 : 0,
      emphasis: fact.emphasis,
      hasChildren: false,
      ancestors: anchor ? [anchor.key, ...anchor.ancestors] : ancestors,
      current,
      previous,
      ...change(current, previous),
      page: fact.page,
      note: fact.note,
    };
    if (!anchor) {
      rows.push(row);
      continue;
    }
    const anchorAt = rows.findIndex((r) => r.key === anchor!.key);
    let end = anchorAt + 1;
    while (end < rows.length && rows[end].level > anchor!.level) end += 1;
    rows.splice(end, 0, row);
  }

  if (options?.includeEmptyRows === false) {
    // Bottom-up: a row without figures stays while one of its children stays.
    const kept = new Set<string>();
    const childrenOf = new Map<string, string[]>();
    for (const row of rows) {
      const parent = row.ancestors[0];
      if (parent) childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), row.key]);
    }
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const row = rows[i];
      const hasFigure = row.current !== null || row.previous !== null;
      const childKept = (childrenOf.get(row.key) ?? []).some((key) => kept.has(key));
      if (hasFigure || childKept) kept.add(row.key);
    }
    return rows.filter((row) => kept.has(row.key));
  }

  return rows;
}

/** Keys of all rows that have children, for "expand all / collapse all". */
export function expandableKeys(rows: StatementRow[]): string[] {
  return rows.filter((r) => r.hasChildren).map((r) => r.key);
}

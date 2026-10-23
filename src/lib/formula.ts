import type { ValueLookup } from './dataset';
import { collectRefs, evaluate, type Node } from './expression';

export type FormulaFailure =
  | 'missing-key'
  | 'null-value'
  | 'no-previous-period'
  | 'not-finite';

export type FormulaOutcome =
  | { ok: true; value: number }
  | { ok: false; reason: FormulaFailure; detail: string };

/**
 * Evaluates a parsed formula for one period.
 * `name[prev]` refers to `previousId`. Missing data never silently becomes 0:
 * the caller gets a typed failure and decides what that means.
 */
export function evaluateInPeriod(
  node: Node,
  lookup: ValueLookup,
  periodId: string,
  previousId: string | null,
): FormulaOutcome {
  for (const ref of collectRefs(node)) {
    if (ref.prev && previousId === null) {
      return { ok: false, reason: 'no-previous-period', detail: ref.name };
    }
    const value = lookup(ref.name, ref.prev ? (previousId as string) : periodId);
    if (value === undefined) return { ok: false, reason: 'missing-key', detail: ref.name };
    if (value === null) return { ok: false, reason: 'null-value', detail: ref.name };
  }

  const value = evaluate(node, (ref) => lookup(ref.name, ref.prev ? (previousId as string) : periodId) as number);
  if (!Number.isFinite(value)) {
    return { ok: false, reason: 'not-finite', detail: 'result is not a finite number' };
  }
  return { ok: true, value };
}

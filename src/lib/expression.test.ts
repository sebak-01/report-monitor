import { describe, expect, it } from 'vitest';
import { collectRefs, evaluate, ExpressionError, parseExpression } from './expression';

const run = (src: string, current: Record<string, number> = {}, prev: Record<string, number> = {}) =>
  evaluate(parseExpression(src), ({ name, prev: isPrev }) => (isPrev ? prev : current)[name]);

describe('expression parser', () => {
  it('respects operator precedence and parentheses', () => {
    expect(run('1 + 2 * 3')).toBe(7);
    expect(run('(1 + 2) * 3')).toBe(9);
    expect(run('10 - 4 - 3')).toBe(3);
    expect(run('8 / 4 / 2')).toBe(1);
  });

  it('supports unary minus', () => {
    expect(run('-a + b', { a: 2, b: 5 })).toBe(3);
    expect(run('a - -b', { a: 2, b: 5 })).toBe(7);
  });

  it('resolves identifiers and [prev] references', () => {
    expect(run('revenue / revenue[prev] - 1', { revenue: 120 }, { revenue: 100 })).toBeCloseTo(0.2);
  });

  it('collects references', () => {
    expect(collectRefs(parseExpression('a + b[prev] * (c - 1)'))).toEqual([
      { name: 'a', prev: false },
      { name: 'b', prev: true },
      { name: 'c', prev: false },
    ]);
  });

  it('rejects anything that is not plain arithmetic', () => {
    for (const bad of [
      'process.exit()',
      'a; b',
      'a.b',
      '"x"',
      'a[next]',
      'a[1]',
      '1 +',
      '(1 + 2',
      '1 2',
      ')(',
    ]) {
      expect(() => parseExpression(bad), bad).toThrow(ExpressionError);
    }
  });

  it('limits expression size and nesting', () => {
    expect(() => parseExpression('1+'.repeat(600) + '1')).toThrow(ExpressionError);
    expect(() => parseExpression('('.repeat(80) + '1' + ')'.repeat(80))).toThrow(ExpressionError);
  });
});

/**
 * A tiny, safe arithmetic expression parser.
 *
 * Datasets will later come from uploaded files, so formulas in them are
 * untrusted input. Nothing here uses eval or `new Function`: formulas are
 * parsed into an AST and evaluated against a value resolver.
 *
 * Grammar:
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/') unary)*
 *   unary   := '-' unary | primary
 *   primary := number | identifier ('[' 'prev' ']')? | '(' expr ')'
 */

export class ExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpressionError';
  }
}

export type Node =
  | { type: 'num'; value: number }
  | { type: 'ref'; name: string; prev: boolean }
  | { type: 'neg'; arg: Node }
  | { type: 'bin'; op: '+' | '-' | '*' | '/'; left: Node; right: Node };

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'id'; value: string }
  | { kind: 'sym'; value: string };

const MAX_LENGTH = 1000;
const MAX_DEPTH = 50;

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const rest = src.slice(i);
    const num = /^\d+(\.\d+)?/.exec(rest);
    if (num) {
      tokens.push({ kind: 'num', value: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (id) {
      tokens.push({ kind: 'id', value: id[0] });
      i += id[0].length;
      continue;
    }
    if ('+-*/()[]'.includes(ch)) {
      tokens.push({ kind: 'sym', value: ch });
      i++;
      continue;
    }
    throw new ExpressionError(`Unexpected character "${ch}" at position ${i}`);
  }
  return tokens;
}

class Parser {
  private pos = 0;
  private depth = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): Node {
    const node = this.expr();
    if (this.pos < this.tokens.length) {
      throw new ExpressionError('Unexpected trailing input');
    }
    return node;
  }

  private peekSym(...symbols: string[]): string | null {
    const t = this.tokens[this.pos];
    return t && t.kind === 'sym' && symbols.includes(t.value) ? t.value : null;
  }

  private expectSym(symbol: string): void {
    if (this.peekSym(symbol) === null) {
      throw new ExpressionError(`Expected "${symbol}"`);
    }
    this.pos++;
  }

  private expr(): Node {
    let left = this.term();
    for (let op = this.peekSym('+', '-'); op; op = this.peekSym('+', '-')) {
      this.pos++;
      const right = this.term();
      left = { type: 'bin', op: op as '+' | '-', left, right };
    }
    return left;
  }

  private term(): Node {
    let left = this.unary();
    for (let op = this.peekSym('*', '/'); op; op = this.peekSym('*', '/')) {
      this.pos++;
      const right = this.unary();
      left = { type: 'bin', op: op as '*' | '/', left, right };
    }
    return left;
  }

  private unary(): Node {
    if (this.peekSym('-')) {
      this.pos++;
      return { type: 'neg', arg: this.unary() };
    }
    return this.primary();
  }

  private primary(): Node {
    const t = this.tokens[this.pos];
    if (!t) throw new ExpressionError('Unexpected end of expression');
    if (t.kind === 'num') {
      this.pos++;
      return { type: 'num', value: t.value };
    }
    if (t.kind === 'id') {
      this.pos++;
      let prev = false;
      if (this.peekSym('[')) {
        this.pos++;
        const mod = this.tokens[this.pos];
        if (!mod || mod.kind !== 'id' || mod.value !== 'prev') {
          throw new ExpressionError('Only [prev] is supported as a period modifier');
        }
        this.pos++;
        this.expectSym(']');
        prev = true;
      }
      return { type: 'ref', name: t.value, prev };
    }
    if (t.value === '(') {
      this.pos++;
      if (++this.depth > MAX_DEPTH) throw new ExpressionError('Expression is nested too deeply');
      const inner = this.expr();
      this.depth--;
      this.expectSym(')');
      return inner;
    }
    throw new ExpressionError(`Unexpected token "${t.value}"`);
  }
}

export function parseExpression(src: string): Node {
  if (src.length > MAX_LENGTH) throw new ExpressionError('Expression is too long');
  return new Parser(tokenize(src)).parse();
}

export interface Ref {
  name: string;
  prev: boolean;
}

/** All value references used by an expression, in order of appearance. */
export function collectRefs(node: Node): Ref[] {
  switch (node.type) {
    case 'num':
      return [];
    case 'ref':
      return [{ name: node.name, prev: node.prev }];
    case 'neg':
      return collectRefs(node.arg);
    case 'bin':
      return [...collectRefs(node.left), ...collectRefs(node.right)];
  }
}

export function evaluate(node: Node, resolve: (ref: Ref) => number): number {
  switch (node.type) {
    case 'num':
      return node.value;
    case 'ref':
      return resolve({ name: node.name, prev: node.prev });
    case 'neg':
      return -evaluate(node.arg, resolve);
    case 'bin': {
      const l = evaluate(node.left, resolve);
      const r = evaluate(node.right, resolve);
      switch (node.op) {
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          return l / r;
      }
    }
  }
}

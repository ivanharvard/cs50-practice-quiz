import { CError, Token, lex } from './lexer';
import {
  BOOL, CHAR, CType, DOUBLE, FILE_T, INT, LONG, VOID, layoutStruct, ptr, sizeOf,
} from './types';

export type Expr = { line: number } & (
  | { k: 'num'; v: number; t: CType }
  | { k: 'str'; s: string; id: number }
  | { k: 'id'; name: string }
  | { k: 'bin'; op: string; a: Expr; b: Expr }
  | { k: 'assign'; op: string; a: Expr; b: Expr }
  | { k: 'un'; op: string; a: Expr }
  | { k: 'post'; op: string; a: Expr }
  | { k: 'call'; name: string; args: Expr[] }
  | { k: 'index'; a: Expr; i: Expr }
  | { k: 'member'; a: Expr; name: string; arrow: boolean }
  | { k: 'cast'; t: CType; a: Expr }
  | { k: 'sizeof_t'; t: CType }
  | { k: 'sizeof_e'; a: Expr }
  | { k: 'cond'; c: Expr; a: Expr; b: Expr }
  | { k: 'comma'; a: Expr; b: Expr }
);

export type Init = Expr | { k: 'list'; items: Init[]; line: number };

export interface Declarator {
  name: string;
  t: CType;
  init?: Init;
  line: number;
}

export type Stmt = { line: number } & (
  | { k: 'block'; body: Stmt[]; end: number }
  | { k: 'decl'; decls: Declarator[] }
  | { k: 'expr'; e: Expr }
  | { k: 'if'; c: Expr; a: Stmt; b?: Stmt }
  | { k: 'while'; c: Expr; body: Stmt }
  | { k: 'do'; body: Stmt; c: Expr; cline: number }
  | { k: 'for'; init?: Stmt; c?: Expr; step?: Expr; body: Stmt }
  | { k: 'switch'; c: Expr; body: Stmt[] }
  | { k: 'case'; v: Expr }
  | { k: 'default' }
  | { k: 'return'; e?: Expr }
  | { k: 'break' }
  | { k: 'continue' }
  | { k: 'empty' }
);

export interface Func {
  name: string;
  ret: CType;
  params: { name: string; t: CType }[];
  body: Extract<Stmt, { k: 'block' }> | null;
  line: number;
}

export interface Program {
  funcs: Map<string, Func>;
  globals: Declarator[];
  strings: string[];
}

export const BUILTINS = new Set([
  'printf', 'fprintf', 'puts', 'putchar', 'fopen', 'fclose', 'fscanf', 'scanf', 'fgetc', 'getc',
  'fgets', 'feof', 'fputc', 'fputs', 'malloc', 'calloc', 'realloc', 'free', 'strlen', 'strcmp',
  'strcpy', 'strcat', 'strncpy', 'exit', 'atoi', 'abs', 'toupper', 'tolower', 'isdigit',
  'isalpha', 'isspace', 'isupper', 'islower', 'rand', 'srand', 'sprintf',
]);

export const BUILTIN_GLOBALS = new Set(['stdout', 'stderr', 'stdin']);

const TYPE_KW = new Set([
  'int', 'char', 'void', 'float', 'double', 'long', 'short', 'unsigned', 'signed', 'const',
  'static', 'struct', 'bool', '_Bool',
]);

export function parse(src: string): Program {
  return new Parser(lex(src)).program();
}

class Parser {
  i = 0;
  typedefs = new Map<string, CType>([
    ['FILE', FILE_T],
    ['size_t', { k: 'int', size: 8, unsigned: true, name: 'size_t' }],
    ['string', ptr(CHAR)],
    ['uint8_t', { k: 'int', size: 1, unsigned: true, name: 'uint8_t' }],
    ['int32_t', INT],
  ]);
  structs = new Map<string, Extract<CType, { k: 'struct' }>>();
  scopes: Set<string>[] = [];
  pendingRefs: { name: string; line: number; call: boolean }[] = [];
  funcs = new Map<string, Func>();
  globals: Declarator[] = [];
  globalNames = new Set<string>();
  strings: string[] = [];

  constructor(public t: Token[]) {}

  get cur() {
    return this.t[this.i];
  }
  peek(n = 1) {
    return this.t[Math.min(this.i + n, this.t.length - 1)];
  }
  is(v: string) {
    const c = this.cur;
    return (c.k === 'punc' || c.k === 'kw') && c.v === v;
  }
  eat(v: string) {
    if (this.is(v)) {
      this.i++;
      return true;
    }
    return false;
  }
  fail(msg: string, tok = this.cur): never {
    throw new CError('compile', msg, tok.line);
  }
  expect(v: string) {
    if (!this.eat(v)) {
      const prev = this.t[this.i - 1];
      if (v === ';' && prev) this.fail(`expected ';' after ${describe(prev)}`, prev);
      this.fail(`expected '${v}' but found ${describe(this.cur)}`);
    }
  }
  ident(): Token {
    const c = this.cur;
    if (c.k !== 'id') this.fail(`expected identifier but found ${describe(c)}`);
    this.i++;
    return c;
  }

  isTypeStart(tok = this.cur): boolean {
    if (tok.k === 'kw' && TYPE_KW.has(tok.v)) return true;
    if (tok.k === 'id' && this.typedefs.has(tok.v) && !this.declaredLocally(tok.v)) return true;
    return false;
  }
  declaredLocally(n: string) {
    return this.scopes.some((s) => s.has(n));
  }

  program(): Program {
    while (this.cur.k !== 'eof') this.external();
    for (const r of this.pendingRefs) {
      if (this.globalNames.has(r.name) || this.funcs.has(r.name) || BUILTIN_GLOBALS.has(r.name)) continue;
      if (r.call && BUILTINS.has(r.name)) continue;
      if (r.call) throw new CError('compile', `call to undeclared function '${r.name}'`, r.line);
      throw new CError('compile', `use of undeclared identifier '${r.name}'`, r.line);
    }
    for (const f of this.funcs.values())
      if (!f.body) throw new CError('compile', `undefined reference to '${f.name}'`, f.line);
    if (!this.funcs.has('main')) throw new CError('compile', "undefined reference to 'main'", null);
    return { funcs: this.funcs, globals: this.globals, strings: this.strings };
  }

  external() {
    if (this.eat('typedef')) {
      const base = this.specifiers();
      do {
        const d = this.declarator(base);
        this.typedefs.set(d.name, d.t);
        if (d.t.k === 'struct' && !d.t.alias) d.t.alias = d.name;
      } while (this.eat(','));
      this.expect(';');
      return;
    }
    const line = this.cur.line;
    if (!this.isTypeStart()) this.fail(`unknown type name '${this.cur.v}'`);
    const base = this.specifiers();
    if (this.eat(';')) return; // bare struct definition
    const d = this.declarator(base);
    if (this.is('(')) {
      this.i++;
      const params: { name: string; t: CType }[] = [];
      if (!(this.is('void') && this.peek().v === ')') && !this.is(')')) {
        do {
          const pb = this.specifiers();
          const pd = this.declarator(pb, true);
          let pt = pd.t;
          if (pt.k === 'arr') pt = ptr(pt.of);
          params.push({ name: pd.name, t: pt });
        } while (this.eat(','));
      } else this.eat('void');
      this.expect(')');
      const existing = this.funcs.get(d.name);
      const fn: Func = existing ?? { name: d.name, ret: d.t, params, body: null, line };
      fn.params = params;
      this.funcs.set(d.name, fn);
      if (this.eat(';')) return;
      if (existing?.body) this.fail(`redefinition of '${d.name}'`);
      fn.line = line;
      this.scopes.push(new Set(params.map((p) => p.name)));
      fn.body = this.block();
      this.scopes.pop();
      return;
    }
    const decls: Declarator[] = [d];
    if (d.t.k === 'void') this.fail(`variable has incomplete type 'void'`);
    if (this.eat('=')) d.init = this.initializer();
    while (this.eat(',')) {
      const nd = this.declarator(base);
      if (this.eat('=')) nd.init = this.initializer();
      decls.push(nd);
    }
    this.expect(';');
    for (const x of decls) {
      this.globals.push(x);
      this.globalNames.add(x.name);
    }
  }

  specifiers(): CType {
    let base: CType | null = null;
    let longs = 0;
    let unsigned = false;
    let short = false;
    let saw = false;
    for (;;) {
      const c = this.cur;
      if (c.k === 'kw') {
        if (c.v === 'const' || c.v === 'static' || c.v === 'signed') {
          this.i++;
          saw = true;
          continue;
        }
        if (c.v === 'unsigned') { unsigned = true; this.i++; saw = true; continue; }
        if (c.v === 'long') { longs++; this.i++; saw = true; continue; }
        if (c.v === 'short') { short = true; this.i++; saw = true; continue; }
        if (base) break;
        if (c.v === 'int') { base = INT; this.i++; continue; }
        if (c.v === 'char') { base = CHAR; this.i++; continue; }
        if (c.v === 'void') { base = VOID; this.i++; continue; }
        if (c.v === 'bool' || c.v === '_Bool') { base = BOOL; this.i++; continue; }
        if (c.v === 'double') { base = DOUBLE; this.i++; continue; }
        if (c.v === 'float') { base = { k: 'float', size: 4 }; this.i++; continue; }
        if (c.v === 'struct') { this.i++; base = this.structSpec(); continue; }
        break;
      }
      if (c.k === 'id' && !base && !saw && this.typedefs.has(c.v)) {
        base = this.typedefs.get(c.v)!;
        this.i++;
        continue;
      }
      break;
    }
    if (!base) {
      if (!saw) this.fail(`expected a type but found ${describe(this.cur)}`);
      base = INT;
    }
    if (base.k === 'int' || base.k === 'char') {
      if (longs) return { ...LONG, unsigned };
      if (short) return { k: 'int', size: 2, unsigned, name: 'short' };
      if (unsigned) return base.k === 'char' ? { k: 'int', size: 1, unsigned, name: 'char' } : { ...INT, unsigned };
    }
    return base;
  }

  structSpec(): CType {
    const tag = this.cur.k === 'id' ? this.ident().v : `<anonymous@${this.cur.line}>`;
    let st = this.structs.get(tag);
    if (!st) {
      st = { k: 'struct', tag, fields: null, size: 0, align: 1 };
      this.structs.set(tag, st);
    }
    if (this.eat('{')) {
      if (st.fields) this.fail(`redefinition of 'struct ${tag}'`);
      const fields: { name: string; type: CType }[] = [];
      while (!this.eat('}')) {
        const b = this.specifiers();
        do {
          const d = this.declarator(b);
          if (d.t.k === 'struct' && !d.t.fields) this.fail(`field '${d.name}' has incomplete type`);
          fields.push({ name: d.name, type: d.t });
        } while (this.eat(','));
        this.expect(';');
      }
      layoutStruct(st, fields);
    }
    return st;
  }

  declarator(base: CType, allowAbstract = false): Declarator {
    let t = base;
    const line = this.cur.line;
    while (this.eat('*')) {
      t = ptr(t);
      while (this.eat('const'));
    }
    let name = '';
    if (this.cur.k === 'id') name = this.ident().v;
    else if (!allowAbstract) this.fail(`expected identifier but found ${describe(this.cur)}`);
    const dims: number[] = [];
    while (this.eat('[')) {
      if (this.eat(']')) dims.push(-1);
      else {
        const e = this.expr();
        const n = constEval(e);
        if (n === null) this.fail('array size must be a constant');
        if (n <= 0) this.fail(`array '${name}' must have a positive size`);
        dims.push(n);
        this.expect(']');
      }
    }
    for (let k = dims.length - 1; k >= 0; k--) t = { k: 'arr', of: t, len: dims[k] };
    return { name, t, line };
  }

  initializer(): Init {
    if (this.is('{')) {
      const line = this.cur.line;
      this.i++;
      const items: Init[] = [];
      while (!this.eat('}')) {
        items.push(this.initializer());
        if (!this.eat(',')) {
          this.expect('}');
          break;
        }
      }
      return { k: 'list', items, line };
    }
    return this.assign();
  }

  block(): Extract<Stmt, { k: 'block' }> {
    const line = this.cur.line;
    this.expect('{');
    this.scopes.push(new Set());
    const body: Stmt[] = [];
    while (!this.is('}')) {
      if (this.cur.k === 'eof') this.fail("expected '}' at end of input");
      body.push(this.stmt());
    }
    const end = this.cur.line;
    this.i++;
    this.scopes.pop();
    return { k: 'block', body, line, end };
  }

  declStmt(): Stmt {
    const line = this.cur.line;
    const base = this.specifiers();
    const decls: Declarator[] = [];
    do {
      const d = this.declarator(base);
      if (d.t.k === 'void') this.fail(`variable has incomplete type 'void'`);
      if (d.t.k === 'struct' && !d.t.fields) this.fail(`variable has incomplete type '${d.t.alias ?? 'struct ' + d.t.tag}'`);
      if (this.scopes[this.scopes.length - 1].has(d.name)) this.fail(`redefinition of '${d.name}'`);
      if (this.eat('=')) d.init = this.initializer();
      this.scopes[this.scopes.length - 1].add(d.name);
      if (d.t.k === 'arr' && d.t.len === -1) {
        const init = d.init;
        const len = init && 'k' in init && init.k === 'list' ? init.items.length : init && init.k === 'str' ? init.s.length + 1 : -1;
        if (len < 0) this.fail(`definition of variable with array type needs an explicit size or an initializer`);
        d.t = { ...d.t, len };
      }
      decls.push(d);
    } while (this.eat(','));
    this.expect(';');
    return { k: 'decl', decls, line };
  }

  stmt(): Stmt {
    const line = this.cur.line;
    if (this.is('{')) return this.block();
    if (this.isTypeStart()) return this.declStmt();
    if (this.cur.k === 'kw') {
      switch (this.cur.v) {
        case 'if': {
          this.i++;
          this.expect('(');
          const c = this.expr();
          this.expect(')');
          const a = this.scoped();
          const b = this.eat('else') ? this.scoped() : undefined;
          return { k: 'if', c, a, b, line };
        }
        case 'while': {
          this.i++;
          this.expect('(');
          const c = this.expr();
          this.expect(')');
          return { k: 'while', c, body: this.scoped(), line };
        }
        case 'do': {
          this.i++;
          const body = this.scoped();
          const cline = this.cur.line;
          this.expect('while');
          this.expect('(');
          const c = this.expr();
          this.expect(')');
          this.expect(';');
          return { k: 'do', body, c, cline, line };
        }
        case 'for': {
          this.i++;
          this.expect('(');
          this.scopes.push(new Set());
          let init: Stmt | undefined;
          if (this.isTypeStart()) init = this.declStmt();
          else if (!this.eat(';')) {
            init = { k: 'expr', e: this.expr(), line };
            this.expect(';');
          }
          const c = this.is(';') ? undefined : this.expr();
          this.expect(';');
          const step = this.is(')') ? undefined : this.expr();
          this.expect(')');
          const body = this.scoped();
          this.scopes.pop();
          return { k: 'for', init, c, step, body, line };
        }
        case 'switch': {
          this.i++;
          this.expect('(');
          const c = this.expr();
          this.expect(')');
          const b = this.block();
          return { k: 'switch', c, body: b.body, line };
        }
        case 'case': {
          this.i++;
          const v = this.cond();
          this.expect(':');
          return { k: 'case', v, line };
        }
        case 'default':
          this.i++;
          this.expect(':');
          return { k: 'default', line };
        case 'return': {
          this.i++;
          const e = this.is(';') ? undefined : this.expr();
          this.expect(';');
          return { k: 'return', e, line };
        }
        case 'break':
          this.i++;
          this.expect(';');
          return { k: 'break', line };
        case 'continue':
          this.i++;
          this.expect(';');
          return { k: 'continue', line };
        case 'else':
          this.fail("expected expression before 'else'");
      }
    }
    if (this.eat(';')) return { k: 'empty', line };
    if (this.cur.k === 'id' && this.peek().k === 'id' && !this.declaredLocally(this.cur.v))
      this.fail(`unknown type name '${this.cur.v}'`);
    const e = this.expr();
    this.expect(';');
    return { k: 'expr', e, line };
  }

  scoped(): Stmt {
    this.scopes.push(new Set());
    const s = this.stmt();
    this.scopes.pop();
    return s;
  }

  expr(): Expr {
    let e = this.assign();
    while (this.is(',')) {
      const line = this.cur.line;
      this.i++;
      e = { k: 'comma', a: e, b: this.assign(), line };
    }
    return e;
  }

  assign(): Expr {
    const a = this.cond();
    const c = this.cur;
    if (c.k === 'punc' && ['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>='].includes(c.v)) {
      this.i++;
      return { k: 'assign', op: c.v, a, b: this.assign(), line: c.line };
    }
    return a;
  }

  cond(): Expr {
    const c = this.binary(1);
    if (this.is('?')) {
      const line = this.cur.line;
      this.i++;
      const a = this.expr();
      this.expect(':');
      const b = this.cond();
      return { k: 'cond', c, a, b, line };
    }
    return c;
  }

  binary(minPrec: number): Expr {
    let a = this.unary();
    for (;;) {
      const c = this.cur;
      const p = c.k === 'punc' ? PREC[c.v] : undefined;
      if (!p || p < minPrec) return a;
      this.i++;
      const b = this.binary(p + 1);
      a = { k: 'bin', op: c.v, a, b, line: c.line };
    }
  }

  unary(): Expr {
    const c = this.cur;
    const line = c.line;
    if (c.k === 'punc') {
      if (c.v === '++' || c.v === '--') {
        this.i++;
        return { k: 'un', op: 'pre' + c.v, a: this.unary(), line };
      }
      if (['-', '+', '!', '~', '*', '&'].includes(c.v)) {
        this.i++;
        return { k: 'un', op: c.v, a: this.unary(), line };
      }
      if (c.v === '(' && this.isTypeStart(this.peek())) {
        this.i++;
        const t = this.typeName();
        this.expect(')');
        return { k: 'cast', t, a: this.unary(), line };
      }
    }
    if (c.k === 'kw' && c.v === 'sizeof') {
      this.i++;
      if (this.is('(') && this.isTypeStart(this.peek())) {
        this.i++;
        const t = this.typeName();
        this.expect(')');
        return { k: 'sizeof_t', t, line };
      }
      return { k: 'sizeof_e', a: this.unary(), line };
    }
    return this.postfix();
  }

  typeName(): CType {
    let t = this.specifiers();
    while (this.eat('*')) t = ptr(t);
    while (this.eat('[')) {
      const n = constEval(this.expr());
      this.expect(']');
      t = { k: 'arr', of: t, len: n ?? 0 };
    }
    return t;
  }

  postfix(): Expr {
    let e = this.primary();
    for (;;) {
      const c = this.cur;
      const line = c.line;
      if (this.eat('[')) {
        const i = this.expr();
        this.expect(']');
        e = { k: 'index', a: e, i, line };
      } else if (this.eat('.') || this.eat('->')) {
        const name = this.ident().v;
        e = { k: 'member', a: e, name, arrow: c.v === '->', line };
      } else if (this.is('++') || this.is('--')) {
        this.i++;
        e = { k: 'post', op: c.v, a: e, line };
      } else if (this.is('(')) {
        if (e.k !== 'id') this.fail('called object is not a function');
        this.i++;
        const args: Expr[] = [];
        if (!this.is(')')) {
          do args.push(this.assign());
          while (this.eat(','));
        }
        this.expect(')');
        const ref = this.pendingRefs.find((r) => r.name === (e as { name: string }).name && r.line === e.line && !r.call);
        if (ref) ref.call = true;
        if (this.declaredLocally(e.name)) this.fail(`called object type is not a function`);
        e = { k: 'call', name: e.name, args, line };
      } else return e;
    }
  }

  primary(): Expr {
    const c = this.cur;
    const line = c.line;
    if (c.k === 'num') {
      this.i++;
      return { k: 'num', v: c.n!, t: c.float ? DOUBLE : c.n! > 2147483647 ? LONG : INT, line };
    }
    if (c.k === 'char') {
      this.i++;
      return { k: 'num', v: c.n!, t: INT, line };
    }
    if (c.k === 'str') {
      this.i++;
      this.strings.push(c.v);
      return { k: 'str', s: c.v, id: this.strings.length - 1, line };
    }
    if (c.k === 'id') {
      this.i++;
      if (!this.declaredLocally(c.v)) {
        if (this.typedefs.has(c.v)) this.fail(`unexpected type name '${c.v}': expected expression`, c);
        this.pendingRefs.push({ name: c.v, line, call: false });
      }
      return { k: 'id', name: c.v, line };
    }
    if (this.eat('(')) {
      const e = this.expr();
      this.expect(')');
      return e;
    }
    this.fail(`expected expression but found ${describe(c)}`);
  }
}

const PREC: Record<string, number> = {
  '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6,
  '<': 7, '>': 7, '<=': 7, '>=': 7, '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10,
};

function describe(t: Token) {
  if (t.k === 'eof') return 'end of file';
  if (t.k === 'str') return 'a string';
  return `'${t.v}'`;
}

export function constEval(e: Expr): number | null {
  switch (e.k) {
    case 'num':
      return e.v;
    case 'un': {
      const v = constEval(e.a);
      if (v === null) return null;
      return e.op === '-' ? -v : e.op === '+' ? v : null;
    }
    case 'bin': {
      const a = constEval(e.a);
      const b = constEval(e.b);
      if (a === null || b === null) return null;
      switch (e.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b ? Math.trunc(a / b) : null;
        default: return null;
      }
    }
    case 'sizeof_t':
      return sizeOf(e.t);
    default:
      return null;
  }
}

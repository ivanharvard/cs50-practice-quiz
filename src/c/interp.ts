import { CError } from './lexer';
import { BUILTINS, Expr, Func, Init, Program, Stmt, parse } from './parser';
import { Fault, HEAP_BASE, Memory, STACK_TOP, hex } from './memory';
import {
  CHAR, CType, DOUBLE, FILE_T, INT, LONG, VOID, isArith, isInteger, ptr, sizeOf, alignOf, typeName,
} from './types';

export interface Value {
  t: CType;
  v: number;
}
interface LV {
  t: CType;
  addr: number;
}
interface Var {
  name: string;
  t: CType;
  addr: number;
}
interface Frame {
  fn: Func;
  scopes: Map<string, Var>[];
  line: number;
}

export interface VarSnap {
  name: string;
  t: CType;
  addr: number;
}
export interface FrameSnap {
  fn: string;
  line: number;
  vars: VarSnap[];
}
export interface HeapBlock {
  addr: number;
  size: number;
  line: number;
  info: { t: CType | null; label?: string };
  freed: boolean;
}
export interface FileSnap {
  addr: number;
  name: string;
  pos: number;
  closed: boolean;
}
export interface Snapshot {
  line: number | null;
  frames: FrameSnap[];
  stackLo: number;
  stack: Uint8Array;
  stackInit: Uint8Array;
  heap: Uint8Array;
  heapInit: Uint8Array;
  data: Uint8Array;
  dataInit: Uint8Array;
  dataBase: number;
  blocks: HeapBlock[];
  files: FileSnap[];
  outLen: number;
  events: string[];
}

export interface RunOptions {
  args?: string[];
  files?: Record<string, string>;
  stdin?: string;
  record?: boolean;
  maxSteps?: number;
}

export interface RunResult {
  output: string;
  exitCode: number | null;
  error: CError | null;
  steps: Snapshot[];
  truncated: boolean;
  files: Record<string, string>;
  strings: Map<number, string>;
}

interface OpenFile {
  name: string;
  data: string;
  pos: number;
  mode: string;
  closed: boolean;
  eof: boolean;
  std?: 'out' | 'err' | 'in';
}

type Signal = { k: 'ret'; v?: Value } | { k: 'break' } | { k: 'continue' } | undefined;

class Exit {
  constructor(public code: number) {}
}

const MAX_RECORD = 4000;

export function run(src: string, opts: RunOptions = {}): RunResult {
  let program: Program;
  try {
    program = parse(src);
  } catch (e) {
    if (e instanceof CError)
      return { output: '', exitCode: null, error: e, steps: [], truncated: false, files: {}, strings: new Map() };
    throw e;
  }
  return new Interp(program, opts).start();
}

class Interp {
  mem = new Memory();
  globals = new Map<string, Var>();
  frames: Frame[] = [];
  out = '';
  steps: Snapshot[] = [];
  stepCount = 0;
  truncated = false;
  line = 0;
  blocks: HeapBlock[] = [];
  files = new Map<number, OpenFile>();
  vfs: Record<string, string>;
  strAddr: number[] = [];
  stringsAt = new Map<number, string>();
  events: string[] = [];
  rand = 1;
  stdAddrs: Record<string, number> = {};

  constructor(public prog: Program, public opts: RunOptions) {
    this.vfs = { ...(opts.files ?? {}) };
  }

  result(exitCode: number | null, error: CError | null): RunResult {
    return {
      output: this.out,
      exitCode,
      error,
      steps: this.steps,
      truncated: this.truncated,
      files: this.vfs,
      strings: this.stringsAt,
    };
  }

  start(): RunResult {
    try {
      for (const s of this.prog.strings) {
        const a = this.mem.allocData(s.length + 1, 1);
        for (let i = 0; i < s.length; i++) this.mem.write(a + i, 1, 'uint', s.charCodeAt(i));
        this.mem.write(a + s.length, 1, 'uint', 0);
        this.strAddr.push(a);
        this.stringsAt.set(a, s);
      }
      for (const n of ['stdin', 'stdout', 'stderr'] as const) {
        const a = this.mem.allocData(16);
        this.stdAddrs[n] = a;
        this.files.set(a, { name: n, data: n === 'stdin' ? (this.opts.stdin ?? '') : '', pos: 0, mode: 'rw', closed: false, eof: false, std: n === 'stdin' ? 'in' : n === 'stdout' ? 'out' : 'err' });
      }
      for (const g of this.prog.globals) {
        const a = this.mem.allocData(sizeOf(g.t), alignOf(g.t));
        this.mem.fill(a, 0, sizeOf(g.t));
        this.globals.set(g.name, { name: g.name, t: g.t, addr: a });
        if (g.init) this.initialize({ t: g.t, addr: a }, g.init);
      }
      const main = this.prog.funcs.get('main')!;
      const argv = ['./' + (this.opts.args?.[0] ?? 'program'), ...(this.opts.args?.slice(1) ?? [])];
      const ptrs = argv.map((s) => {
        const a = this.mem.pushStack(s.length + 1, 1);
        for (let i = 0; i < s.length; i++) this.mem.write(a + i, 1, 'uint', s.charCodeAt(i));
        this.mem.write(a + s.length, 1, 'uint', 0);
        return a;
      });
      const arr = this.mem.pushStack(8 * (argv.length + 1), 16);
      ptrs.forEach((p, i) => this.mem.write(arr + i * 8, 8, 'uint', p));
      this.mem.write(arr + argv.length * 8, 8, 'uint', 0);
      const args: Value[] = [
        { t: INT, v: argv.length },
        { t: ptr(ptr(CHAR)), v: arr },
      ].slice(0, main.params.length);
      const r = this.call(main, args, main.line);
      const code = r ? r.v : 0;
      this.line = 0;
      this.snap(null);
      return this.result(code, null);
    } catch (e) {
      if (e instanceof Exit) {
        this.snap(null);
        return this.result(e.code, null);
      }
      if (e instanceof CError) {
        this.snap(null);
        return this.result(null, e);
      }
      if (e instanceof Fault) {
        this.snap(null);
        const m = e.message;
        const kind = m.startsWith('invalid memory') || m === 'stack overflow' ? 'Segmentation fault' : m.startsWith('free()') || m.startsWith('double') ? 'Aborted' : 'Error';
        const err = new CError('runtime', `${kind}: ${m}`, this.line || null);
        return this.result(kind === 'Segmentation fault' ? 139 : 134, err);
      }
      throw e;
    }
  }

  // ----- tracing -------------------------------------------------------------

  step(line: number) {
    this.line = line;
    const f = this.frames[this.frames.length - 1];
    if (f) f.line = line;
    this.stepCount++;
    if (this.stepCount > (this.opts.maxSteps ?? 200000))
      throw new CError('runtime', 'Program stopped: it ran for too long. Is there an infinite loop?', line);
    this.snap(line);
  }

  snap(line: number | null) {
    if (this.opts.record === false) return;
    if (this.steps.length >= MAX_RECORD) {
      this.truncated = true;
      return;
    }
    const m = this.mem;
    const lo = m.sp - 64;
    const so = lo - m.stack.base;
    const he = m.brk - HEAP_BASE;
    const de = m.dataTop - m.data.base;
    this.steps.push({
      line,
      frames: this.frames.map((fr) => ({
        fn: fr.fn.name,
        line: fr.line,
        vars: fr.scopes.flatMap((s) => [...s.values()]).map((v) => ({ ...v })),
      })),
      stackLo: lo,
      stack: m.stack.bytes.slice(so),
      stackInit: m.stack.init.slice(so),
      heap: m.heap.bytes.slice(0, he),
      heapInit: m.heap.init.slice(0, he),
      data: m.data.bytes.slice(0, de),
      dataInit: m.data.init.slice(0, de),
      dataBase: m.data.base,
      blocks: this.blocks.map((b) => ({ ...b })),
      files: [...this.files.entries()].filter(([, f]) => !f.std).map(([addr, f]) => ({ addr, name: f.name, pos: f.pos, closed: f.closed })),
      outLen: this.out.length,
      events: this.events,
    });
    this.events = [];
  }

  // ----- statements ----------------------------------------------------------

  get frame() {
    return this.frames[this.frames.length - 1];
  }

  call(fn: Func, args: Value[], line: number): Value | undefined {
    if (args.length !== fn.params.length)
      throw new CError('compile', `too ${args.length < fn.params.length ? 'few' : 'many'} arguments to function call, expected ${fn.params.length}, have ${args.length}`, line);
    if (this.frames.length > 2000) throw new Fault('stack overflow');
    const sp = this.mem.sp;
    const scope = new Map<string, Var>();
    fn.params.forEach((p, i) => {
      const a = this.mem.pushStack(sizeOf(p.t), alignOf(p.t));
      this.store({ t: p.t, addr: a }, this.convert(args[i], p.t, line));
      if (p.name) scope.set(p.name, { name: p.name, t: p.t, addr: a });
    });
    this.frames.push({ fn, scopes: [scope], line: fn.line });
    const sig = this.exec(fn.body!);
    let rv: Value | undefined;
    if (sig?.k === 'ret') {
      if (sig.v && fn.ret.k !== 'void') rv = this.convert(sig.v, fn.ret, this.line);
    } else {
      this.step(fn.body!.end);
    }
    this.frames.pop();
    this.mem.sp = sp;
    if (rv === undefined && fn.ret.k !== 'void' && fn.name !== 'main') {
      rv = { t: fn.ret, v: 0 };
    }
    if (fn.name !== 'main') this.events.push(rv ? `${fn.name} returned ${fmtValue(fn.ret, rv.v, this.mem)}` : `${fn.name} returned`);
    return rv;
  }

  exec(s: Stmt): Signal {
    switch (s.k) {
      case 'block': {
        const sp = this.mem.sp;
        this.frame.scopes.push(new Map());
        try {
          for (const st of s.body) {
            const r = this.exec(st);
            if (r) return r;
          }
        } finally {
          this.frame.scopes.pop();
          this.mem.sp = sp;
        }
        return;
      }
      case 'decl':
        this.step(s.line);
        for (const d of s.decls) {
          const a = this.mem.pushStack(sizeOf(d.t), alignOf(d.t));
          const v: Var = { name: d.name, t: d.t, addr: a };
          this.frame.scopes[this.frame.scopes.length - 1].set(d.name, v);
          if (d.init) this.initialize(v, d.init);
        }
        return;
      case 'expr':
        this.step(s.line);
        this.eval(s.e);
        return;
      case 'if':
        this.step(s.line);
        if (this.truthy(this.eval(s.c))) return this.scoped(s.a);
        if (s.b) return this.scoped(s.b);
        return;
      case 'while':
        for (;;) {
          this.step(s.line);
          if (!this.truthy(this.eval(s.c))) return;
          const r = this.scoped(s.body);
          if (r?.k === 'break') return;
          if (r?.k === 'ret') return r;
        }
      case 'do':
        for (;;) {
          const r = this.scoped(s.body);
          if (r?.k === 'break') return;
          if (r?.k === 'ret') return r;
          this.step(s.cline);
          if (!this.truthy(this.eval(s.c))) return;
        }
      case 'for': {
        const sp = this.mem.sp;
        this.frame.scopes.push(new Map());
        try {
          if (s.init) this.exec(s.init);
          let first = true;
          for (;;) {
            if (!first || !s.init) this.step(s.line);
            first = false;
            if (s.c && !this.truthy(this.eval(s.c))) return;
            const r = this.scoped(s.body);
            if (r?.k === 'break') return;
            if (r?.k === 'ret') return r;
            if (s.step) this.eval(s.step);
          }
        } finally {
          this.frame.scopes.pop();
          this.mem.sp = sp;
        }
      }
      case 'switch': {
        this.step(s.line);
        const v = this.eval(s.c).v;
        let start = s.body.findIndex((st) => st.k === 'case' && this.eval(st.v).v === v);
        if (start < 0) start = s.body.findIndex((st) => st.k === 'default');
        if (start < 0) return;
        this.frame.scopes.push(new Map());
        try {
          for (let i = start; i < s.body.length; i++) {
            const st = s.body[i];
            if (st.k === 'case' || st.k === 'default') continue;
            const r = this.exec(st);
            if (r?.k === 'break') return;
            if (r) return r;
          }
        } finally {
          this.frame.scopes.pop();
        }
        return;
      }
      case 'case':
      case 'default':
        return;
      case 'return':
        this.step(s.line);
        return { k: 'ret', v: s.e ? this.eval(s.e) : undefined };
      case 'break':
        this.step(s.line);
        return { k: 'break' };
      case 'continue':
        this.step(s.line);
        return { k: 'continue' };
      case 'empty':
        return;
    }
  }

  scoped(s: Stmt): Signal {
    if (s.k === 'block') return this.exec(s);
    const sp = this.mem.sp;
    this.frame.scopes.push(new Map());
    try {
      return this.exec(s);
    } finally {
      this.frame.scopes.pop();
      this.mem.sp = sp;
    }
  }

  initialize(lv: LV, init: Init) {
    const t = lv.t;
    if ('k' in init && init.k === 'list') {
      if (t.k === 'arr') {
        const es = sizeOf(t.of);
        this.mem.fill(lv.addr, 0, sizeOf(t));
        init.items.slice(0, t.len).forEach((it, i) => this.initialize({ t: t.of, addr: lv.addr + i * es }, it));
      } else if (t.k === 'struct') {
        this.mem.fill(lv.addr, 0, sizeOf(t));
        init.items.forEach((it, i) => {
          const f = t.fields![i];
          if (f) this.initialize({ t: f.type, addr: lv.addr + f.offset }, it);
        });
      } else if (init.items[0]) this.initialize(lv, init.items[0]);
      return;
    }
    const e = init as Expr;
    if (t.k === 'arr' && e.k === 'str' && t.of.k === 'char') {
      this.mem.fill(lv.addr, 0, t.len);
      for (let i = 0; i < Math.min(e.s.length, t.len); i++) this.mem.write(lv.addr + i, 1, 'uint', e.s.charCodeAt(i));
      return;
    }
    if (t.k === 'arr') throw new CError('compile', 'array initializer must be an initializer list', e.line);
    this.store(lv, this.convert(this.eval(e), t, e.line));
  }

  // ----- memory helpers ------------------------------------------------------

  load(lv: LV): Value {
    const t = lv.t;
    if (t.k === 'arr') return { t: ptr(t.of), v: lv.addr };
    if (t.k === 'struct') return { t, v: lv.addr };
    if (t.k === 'file' || t.k === 'void') throw new CError('runtime', `cannot read a value of type '${typeName(t)}'`, this.line);
    this.nullCheck(lv.addr);
    return { t, v: this.mem.read(lv.addr, sizeOf(t), kindOf(t)) };
  }

  store(lv: LV, val: Value) {
    const t = lv.t;
    this.nullCheck(lv.addr);
    if (t.k === 'struct') {
      this.mem.copy(lv.addr, val.v, sizeOf(t));
      return;
    }
    if (t.k === 'arr') throw new CError('compile', `array type '${typeName(t)}' is not assignable`, this.line);
    this.mem.write(lv.addr, sizeOf(t), kindOf(t), val.v);
  }

  nullCheck(addr: number) {
    if (addr >= 0 && addr < 4096) throw new Fault(`invalid memory access at address ${hex(addr)} (dereferenced a NULL pointer)`);
  }

  convert(v: Value, t: CType, line: number): Value {
    const from = v.t;
    switch (t.k) {
      case 'int':
      case 'char':
      case 'bool': {
        if (from.k === 'struct') throw new CError('compile', `cannot convert '${typeName(from)}' to '${typeName(t)}'`, line);
        let n = from.k === 'float' ? Math.trunc(v.v) : v.v;
        if (t.k === 'bool') n = n !== 0 ? 1 : 0;
        else if (t.k === 'char') n = (n << 24) >> 24;
        else n = wrap(n, t.size, !!t.unsigned);
        return { t, v: n };
      }
      case 'float':
        if (from.k === 'ptr' || from.k === 'struct') throw new CError('compile', `cannot convert '${typeName(from)}' to '${typeName(t)}'`, line);
        return { t, v: t.size === 4 ? Math.fround(v.v) : v.v };
      case 'ptr':
        if (from.k === 'float' || from.k === 'struct') throw new CError('compile', `cannot convert '${typeName(from)}' to '${typeName(t)}'`, line);
        if (t.to.k !== 'void') this.inferHeap(v.v, t.to);
        return { t, v: v.v };
      case 'struct':
        if (from !== t) throw new CError('compile', `cannot convert '${typeName(from)}' to '${typeName(t)}'`, line);
        return v;
      default:
        return { t, v: v.v };
    }
  }

  inferHeap(addr: number, t: CType) {
    const b = this.blocks.find((x) => x.addr === addr);
    if (b && !b.info.t && !b.info.label) b.info.t = t;
  }

  truthy(v: Value) {
    if (v.t.k === 'struct') throw new CError('compile', 'statement requires expression of scalar type', this.line);
    return v.v !== 0;
  }

  lookup(name: string, line: number): Var {
    const f = this.frame;
    for (let i = f.scopes.length - 1; i >= 0; i--) {
      const v = f.scopes[i].get(name);
      if (v) return v;
    }
    const g = this.globals.get(name);
    if (g) return g;
    throw new CError('compile', `use of undeclared identifier '${name}'`, line);
  }

  // ----- expressions ---------------------------------------------------------

  lval(e: Expr): LV {
    switch (e.k) {
      case 'id':
        return this.lookup(e.name, e.line);
      case 'un':
        if (e.op === '*') {
          const p = this.eval(e.a);
          if (p.t.k !== 'ptr') throw new CError('compile', `indirection requires pointer operand ('${typeName(p.t)}' invalid)`, e.line);
          if (p.t.to.k === 'void') throw new CError('compile', 'cannot dereference a void * pointer', e.line);
          return { t: p.t.to, addr: p.v };
        }
        break;
      case 'index': {
        let a = this.eval(e.a);
        let i = this.eval(e.i);
        if (a.t.k !== 'ptr' && i.t.k === 'ptr') [a, i] = [i, a];
        if (a.t.k !== 'ptr') throw new CError('compile', 'subscripted value is not an array or pointer', e.line);
        if (!isInteger(i.t)) throw new CError('compile', 'array subscript is not an integer', e.line);
        return { t: a.t.to, addr: a.v + i.v * sizeOf(a.t.to) };
      }
      case 'member': {
        let base: number;
        let st: CType;
        if (e.arrow) {
          const p = this.eval(e.a);
          if (p.t.k !== 'ptr' || p.t.to.k !== 'struct')
            throw new CError('compile', `member reference type '${typeName(p.t)}' is not a pointer to a struct${p.t.k === 'struct' ? "; did you mean to use '.'?" : ''}`, e.line);
          base = p.v;
          st = p.t.to;
        } else {
          const v = this.eval(e.a);
          if (v.t.k !== 'struct')
            throw new CError('compile', `member reference base type '${typeName(v.t)}' is not a structure${v.t.k === 'ptr' ? "; did you mean to use '->'?" : ''}`, e.line);
          base = v.v;
          st = v.t;
        }
        const f = (st as Extract<CType, { k: 'struct' }>).fields!.find((x) => x.name === e.name);
        if (!f) throw new CError('compile', `no member named '${e.name}' in '${typeName(st)}'`, e.line);
        return { t: f.type, addr: base + f.offset };
      }
      case 'str':
        return { t: { k: 'arr', of: CHAR, len: e.s.length + 1 }, addr: this.strAddr[e.id] };
    }
    throw new CError('compile', 'expression is not assignable', e.line);
  }

  isLvalue(e: Expr) {
    return e.k === 'id' || (e.k === 'un' && e.op === '*') || e.k === 'index' || e.k === 'member';
  }

  eval(e: Expr): Value {
    switch (e.k) {
      case 'num':
        return { t: e.t, v: e.v };
      case 'str':
        return { t: ptr(CHAR), v: this.strAddr[e.id] };
      case 'id':
        if (e.name in this.stdAddrs && !this.hasVar(e.name)) return { t: ptr(FILE_T), v: this.stdAddrs[e.name] };
        if (this.prog.funcs.has(e.name) && !this.hasVar(e.name))
          throw new CError('compile', `function '${e.name}' used as a value; did you forget the parentheses?`, e.line);
        return this.load(this.lookup(e.name, e.line));
      case 'index':
      case 'member':
        return this.load(this.lval(e));
      case 'bin': {
        if (e.op === '&&') return { t: INT, v: this.truthy(this.eval(e.a)) && this.truthy(this.eval(e.b)) ? 1 : 0 };
        if (e.op === '||') return { t: INT, v: this.truthy(this.eval(e.a)) || this.truthy(this.eval(e.b)) ? 1 : 0 };
        return this.arith(e.op, this.eval(e.a), this.eval(e.b), e.line);
      }
      case 'assign': {
        if (!this.isLvalue(e.a)) throw new CError('compile', 'expression is not assignable', e.line);
        const lv = this.lval(e.a);
        const rhs = this.eval(e.b);
        const val = e.op === '=' ? rhs : this.arith(e.op.slice(0, -1), this.load(lv), rhs, e.line);
        if (lv.t.k === 'ptr' && val.t.k === 'ptr' && e.op === '=') this.checkPtrAssign(lv.t, val.t, e.line);
        if (lv.t.k === 'ptr' && isInteger(val.t) && val.v !== 0 && e.op === '=')
          throw new CError('compile', `incompatible integer to pointer conversion assigning to '${typeName(lv.t)}' from '${typeName(val.t)}'`, e.line);
        const cv = this.convert(val, lv.t, e.line);
        this.store(lv, cv);
        return this.load(lv);
      }
      case 'un': {
        switch (e.op) {
          case '*':
            return this.load(this.lval(e));
          case '&': {
            if (e.a.k === 'id' && this.prog.funcs.has(e.a.name) && !this.hasVar(e.a.name))
              throw new CError('compile', 'function pointers are not supported here', e.line);
            if (!this.isLvalue(e.a)) throw new CError('compile', 'cannot take the address of an rvalue', e.line);
            const lv = this.lval(e.a);
            return { t: ptr(lv.t), v: lv.addr };
          }
          case '-': {
            const v = this.eval(e.a);
            return this.arith('-', { t: INT, v: 0 }, v, e.line);
          }
          case '+':
            return this.arith('+', { t: INT, v: 0 }, this.eval(e.a), e.line);
          case '!':
            return { t: INT, v: this.truthy(this.eval(e.a)) ? 0 : 1 };
          case '~': {
            const v = this.eval(e.a);
            return { t: INT, v: ~v.v };
          }
          case 'pre++':
          case 'pre--': {
            if (!this.isLvalue(e.a)) throw new CError('compile', 'expression is not assignable', e.line);
            const lv = this.lval(e.a);
            const nv = this.convert(this.arith(e.op === 'pre++' ? '+' : '-', this.load(lv), { t: INT, v: 1 }, e.line), lv.t, e.line);
            this.store(lv, nv);
            return nv;
          }
        }
        throw new CError('compile', `unknown operator ${e.op}`, e.line);
      }
      case 'post': {
        if (!this.isLvalue(e.a)) throw new CError('compile', 'expression is not assignable', e.line);
        const lv = this.lval(e.a);
        const old = this.load(lv);
        this.store(lv, this.convert(this.arith(e.op === '++' ? '+' : '-', old, { t: INT, v: 1 }, e.line), lv.t, e.line));
        return old;
      }
      case 'call':
        return this.callExpr(e);
      case 'cast':
        if (e.t.k === 'void') {
          this.eval(e.a);
          return { t: VOID, v: 0 };
        }
        return this.convert(this.eval(e.a), e.t, e.line);
      case 'sizeof_t':
        return { t: LONG, v: sizeOf(e.t) };
      case 'sizeof_e':
        return { t: LONG, v: sizeOf(this.isLvalue(e.a) || e.a.k === 'str' ? this.lval(e.a).t : this.eval(e.a).t) };
      case 'cond':
        return this.truthy(this.eval(e.c)) ? this.eval(e.a) : this.eval(e.b);
      case 'comma':
        this.eval(e.a);
        return this.eval(e.b);
    }
  }

  hasVar(name: string) {
    return !!this.frame?.scopes.some((s) => s.has(name)) || this.globals.has(name);
  }

  checkPtrAssign(to: CType, from: CType, line: number) {
    if (to.k !== 'ptr' || from.k !== 'ptr') return;
    if (to.to.k === 'void' || from.to.k === 'void') return;
    if (typeName(to) !== typeName(from))
      throw new CError('compile', `incompatible pointer types assigning to '${typeName(to)}' from '${typeName(from)}'`, line);
  }

  arith(op: string, a: Value, b: Value, line: number): Value {
    const cmp = ['==', '!=', '<', '>', '<=', '>='].includes(op);
    if (a.t.k === 'struct' || b.t.k === 'struct') throw new CError('compile', `invalid operands to binary expression ('${typeName(a.t)}' and '${typeName(b.t)}')`, line);
    if (a.t.k === 'ptr' || b.t.k === 'ptr') {
      if (cmp) return { t: INT, v: compare(op, a.v, b.v) ? 1 : 0 };
      if (op === '+' || op === '-') {
        if (a.t.k === 'ptr' && b.t.k === 'ptr') {
          if (op === '-') return { t: LONG, v: Math.trunc((a.v - b.v) / sizeOf(a.t.to)) };
          throw new CError('compile', 'invalid operands to binary expression (two pointers)', line);
        }
        if (a.t.k === 'ptr') return { t: a.t, v: a.v + (op === '+' ? 1 : -1) * b.v * sizeOf(a.t.to) };
        if (op === '+') return { t: b.t, v: b.v + a.v * sizeOf((b.t as { to: CType }).to) };
      }
      throw new CError('compile', `invalid operands to binary expression ('${typeName(a.t)}' and '${typeName(b.t)}')`, line);
    }
    if (!isArith(a.t) || !isArith(b.t)) throw new CError('compile', `invalid operands to binary expression`, line);
    if (cmp) return { t: INT, v: compare(op, a.v, b.v) ? 1 : 0 };
    if (a.t.k === 'float' || b.t.k === 'float') {
      const x = a.v;
      const y = b.v;
      switch (op) {
        case '+': return { t: DOUBLE, v: x + y };
        case '-': return { t: DOUBLE, v: x - y };
        case '*': return { t: DOUBLE, v: x * y };
        case '/': return { t: DOUBLE, v: x / y };
      }
      throw new CError('compile', `invalid operands to binary expression ('double')`, line);
    }
    const size = (a.t.k === 'int' && a.t.size === 8) || (b.t.k === 'int' && b.t.size === 8) ? 8 : 4;
    const unsigned = (a.t.k === 'int' && !!a.t.unsigned && a.t.size >= 4) || (b.t.k === 'int' && !!b.t.unsigned && b.t.size >= 4);
    const t: CType = size === 8 ? { ...LONG, unsigned } : unsigned ? { ...INT, unsigned } : INT;
    const x = a.v;
    const y = b.v;
    let r: number;
    switch (op) {
      case '+': r = x + y; break;
      case '-': r = x - y; break;
      case '*': r = size === 4 ? Math.imul(x, y) : x * y; break;
      case '/':
        if (y === 0) throw new CError('runtime', 'Floating point exception: division by zero', line);
        r = Math.trunc(x / y);
        break;
      case '%':
        if (y === 0) throw new CError('runtime', 'Floating point exception: division by zero', line);
        r = x % y;
        break;
      case '&': r = x & y; break;
      case '|': r = x | y; break;
      case '^': r = x ^ y; break;
      case '<<': r = x << y; break;
      case '>>': r = x >> y; break;
      default:
        throw new CError('compile', `unknown operator ${op}`, line);
    }
    return { t, v: wrap(r, size, unsigned) };
  }

  // ----- calls ---------------------------------------------------------------

  callExpr(e: Extract<Expr, { k: 'call' }>): Value {
    const fn = this.prog.funcs.get(e.name);
    if (fn) {
      const args = e.args.map((a) => this.eval(a));
      fn.params.forEach((p, i) => {
        if (args[i] && p.t.k === 'ptr' && args[i].t.k === 'ptr') this.checkPtrAssign(p.t, args[i].t, e.line);
      });
      this.events.push(`called ${e.name}(${fn.params.map((p, i) => `${p.name} = ${args[i] ? fmtValue(p.t, this.convert(args[i], p.t, e.line).v, this.mem) : '?'}`).join(', ')})`);
      return this.call(fn, args, e.line) ?? { t: VOID, v: 0 };
    }
    if (!BUILTINS.has(e.name)) throw new CError('compile', `call to undeclared function '${e.name}'`, e.line);
    return this.builtin(e.name, e.args, e.line);
  }

  str(v: Value, line: number) {
    if (v.t.k !== 'ptr') throw new CError('compile', `expected a string (char *) but got '${typeName(v.t)}'`, line);
    if (v.v === 0) throw new Fault('invalid memory access at address 0x000000 (string pointer is NULL)');
    return this.mem.readCString(v.v);
  }

  file(v: Value, fn: string): OpenFile {
    if (v.v === 0) throw new Fault(`invalid memory access at address 0x000000 (${fn} was given a NULL FILE pointer)`);
    const f = this.files.get(v.v);
    if (!f) throw new Fault(`invalid memory access at address ${hex(v.v)} (${fn} was given something that is not a FILE)`);
    if (f.closed) throw new Fault(`double free or corruption: ${fn} used a FILE that was already closed`);
    return f;
  }

  write(f: OpenFile, s: string) {
    if (f.std === 'out' || f.std === 'err') this.out += s;
    else {
      if (!/[wa+]/.test(f.mode)) return;
      f.data += s;
    }
    if (this.out.length > 200000) throw new CError('runtime', 'Program stopped: too much output.', this.line);
  }

  builtin(name: string, argE: Expr[], line: number): Value {
    const args = argE.map((a) => this.eval(a));
    const need = (n: number) => {
      if (args.length < n) throw new CError('compile', `too few arguments to function call, expected ${n}, have ${args.length}`, line);
    };
    const I = (v: number): Value => ({ t: INT, v });
    const out = this.files.get(this.stdAddrs.stdout)!;
    switch (name) {
      case 'printf':
        need(1);
        return I(this.emit(out, this.format(this.str(args[0], line), args.slice(1), line)));
      case 'fprintf':
        need(2);
        return I(this.emit(this.file(args[0], 'fprintf'), this.format(this.str(args[1], line), args.slice(2), line)));
      case 'sprintf': {
        need(2);
        const s = this.format(this.str(args[1], line), args.slice(2), line);
        this.writeCString(args[0].v, s);
        return I(s.length);
      }
      case 'puts':
        need(1);
        return I(this.emit(out, this.str(args[0], line) + '\n'));
      case 'putchar':
        need(1);
        this.write(out, String.fromCharCode(args[0].v & 0xff));
        return I(args[0].v);
      case 'fputc':
        need(2);
        this.write(this.file(args[1], 'fputc'), String.fromCharCode(args[0].v & 0xff));
        return I(args[0].v);
      case 'fputs':
        need(2);
        this.write(this.file(args[1], 'fputs'), this.str(args[0], line));
        return I(1);
      case 'fopen': {
        need(2);
        const fname = this.str(args[0], line);
        const mode = this.str(args[1], line);
        let data: string;
        if (mode.startsWith('r')) {
          if (!(fname in this.vfs)) {
            this.events.push(`fopen("${fname}") failed: no such file`);
            return { t: ptr(FILE_T), v: 0 };
          }
          data = this.vfs[fname];
        } else if (mode.startsWith('a')) data = this.vfs[fname] ?? '';
        else data = '';
        const addr = this.mem.sbrk(sizeOf(FILE_T));
        this.mem.fill(addr, 0, sizeOf(FILE_T));
        this.blocks.push({ addr, size: sizeOf(FILE_T), line, info: { t: FILE_T, label: `FILE "${fname}"` }, freed: false });
        this.files.set(addr, { name: fname, data, pos: 0, mode, closed: false, eof: false });
        this.events.push(`fopen("${fname}") opened the file`);
        return { t: ptr(FILE_T), v: addr };
      }
      case 'fclose': {
        need(1);
        const f = this.file(args[0], 'fclose');
        f.closed = true;
        if (/[wa+]/.test(f.mode)) this.vfs[f.name] = f.data;
        const b = this.blocks.find((x) => x.addr === args[0].v);
        if (b) b.freed = true;
        return I(0);
      }
      case 'feof': {
        need(1);
        return I(this.file(args[0], 'feof').eof ? 1 : 0);
      }
      case 'fgetc':
      case 'getc': {
        need(1);
        const f = this.file(args[0], name);
        if (f.pos >= f.data.length) {
          f.eof = true;
          return I(-1);
        }
        return I(f.data.charCodeAt(f.pos++));
      }
      case 'fgets': {
        need(3);
        const f = this.file(args[2], 'fgets');
        if (f.pos >= f.data.length) {
          f.eof = true;
          return { t: ptr(CHAR), v: 0 };
        }
        let s = '';
        while (s.length < args[1].v - 1 && f.pos < f.data.length) {
          const c = f.data[f.pos++];
          s += c;
          if (c === '\n') break;
        }
        this.writeCString(args[0].v, s);
        return args[0];
      }
      case 'fscanf':
        need(2);
        return I(this.scan(this.file(args[0], 'fscanf'), this.str(args[1], line), args.slice(2), argE.slice(2), line));
      case 'scanf':
        need(1);
        return I(this.scan(this.files.get(this.stdAddrs.stdin)!, this.str(args[0], line), args.slice(1), argE.slice(1), line));
      case 'malloc':
      case 'calloc': {
        need(name === 'malloc' ? 1 : 2);
        const n = name === 'malloc' ? args[0].v : args[0].v * args[1].v;
        const a = this.mem.sbrk(Math.max(1, n));
        if (a && name === 'calloc') this.mem.fill(a, 0, n);
        if (a) this.blocks.push({ addr: a, size: n, line, info: { t: null }, freed: false });
        return { t: ptr(VOID), v: a };
      }
      case 'realloc': {
        need(2);
        const old = this.blocks.find((b) => b.addr === args[0].v && !b.freed);
        const a = this.mem.sbrk(Math.max(1, args[1].v));
        if (old) {
          this.mem.copy(a, old.addr, Math.min(old.size, args[1].v));
          old.freed = true;
        }
        this.blocks.push({ addr: a, size: args[1].v, line, info: { t: old?.info.t ?? null }, freed: false });
        return { t: ptr(VOID), v: a };
      }
      case 'free': {
        need(1);
        if (args[0].v === 0) return { t: VOID, v: 0 };
        const b = this.blocks.find((x) => x.addr === args[0].v);
        if (!b || b.info.t?.k === 'file') throw new Fault(`free(): invalid pointer ${hex(args[0].v)}`);
        if (b.freed) throw new Fault(`free(): double free detected for ${hex(args[0].v)}`);
        b.freed = true;
        return { t: VOID, v: 0 };
      }
      case 'strlen':
        need(1);
        return { t: LONG, v: this.str(args[0], line).length };
      case 'strcmp': {
        need(2);
        const x = this.str(args[0], line);
        const y = this.str(args[1], line);
        return I(x < y ? -1 : x > y ? 1 : 0);
      }
      case 'strcpy':
        need(2);
        this.writeCString(args[0].v, this.str(args[1], line));
        return args[0];
      case 'strncpy': {
        need(3);
        const s = this.str(args[1], line).slice(0, args[2].v);
        for (let i = 0; i < args[2].v; i++) this.mem.write(args[0].v + i, 1, 'uint', i < s.length ? s.charCodeAt(i) : 0);
        return args[0];
      }
      case 'strcat':
        need(2);
        this.writeCString(args[0].v + this.str(args[0], line).length, this.str(args[1], line));
        return args[0];
      case 'atoi': {
        need(1);
        const m = this.str(args[0], line).match(/^\s*([+-]?\d+)/);
        return I(m ? wrap(Number(m[1]), 4, false) : 0);
      }
      case 'abs':
        need(1);
        return I(Math.abs(args[0].v));
      case 'toupper':
        return I(args[0].v >= 97 && args[0].v <= 122 ? args[0].v - 32 : args[0].v);
      case 'tolower':
        return I(args[0].v >= 65 && args[0].v <= 90 ? args[0].v + 32 : args[0].v);
      case 'isdigit':
        return I(args[0].v >= 48 && args[0].v <= 57 ? 1 : 0);
      case 'isalpha':
        return I(/[A-Za-z]/.test(String.fromCharCode(args[0].v)) ? 1 : 0);
      case 'isupper':
        return I(args[0].v >= 65 && args[0].v <= 90 ? 1 : 0);
      case 'islower':
        return I(args[0].v >= 97 && args[0].v <= 122 ? 1 : 0);
      case 'isspace':
        return I(/\s/.test(String.fromCharCode(args[0].v)) ? 1 : 0);
      case 'rand':
        this.rand = (Math.imul(this.rand, 1103515245) + 12345) & 0x7fffffff;
        return I(this.rand);
      case 'srand':
        this.rand = args[0].v;
        return { t: VOID, v: 0 };
      case 'exit':
        need(1);
        throw new Exit(args[0].v);
    }
    throw new CError('compile', `call to undeclared function '${name}'`, line);
  }

  emit(f: OpenFile, s: string) {
    this.write(f, s);
    return s.length;
  }

  writeCString(addr: number, s: string) {
    for (let i = 0; i < s.length; i++) this.mem.write(addr + i, 1, 'uint', s.charCodeAt(i));
    this.mem.write(addr + s.length, 1, 'uint', 0);
  }

  format(fmt: string, args: Value[], line: number): string {
    let out = '';
    let ai = 0;
    const re = /%([-+ 0#]*)(\*|\d+)?(?:\.(\d+))?(hh|h|ll|l|z)?([diucsfpxX%eg])/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(fmt))) {
      out += fmt.slice(last, m.index);
      last = re.lastIndex;
      const [, flags, widthS, precS, len, conv] = m;
      if (conv === '%') {
        out += '%';
        continue;
      }
      let width = widthS === '*' ? args[ai++]?.v ?? 0 : widthS ? Number(widthS) : 0;
      const arg = args[ai++];
      if (!arg) throw new CError('runtime', `printf: format string has more '%' conversions than arguments`, line);
      let s: string;
      switch (conv) {
        case 'd':
        case 'i':
          if (arg.t.k === 'float') throw new CError('runtime', `format '%d' expects an int but the argument is a ${typeName(arg.t)}`, line);
          s = String(len === 'l' || len === 'll' ? arg.v : wrap(arg.v, 4, false));
          if (flags.includes('+') && arg.v >= 0) s = '+' + s;
          break;
        case 'u':
          s = String(arg.v >>> 0);
          break;
        case 'c':
          s = String.fromCharCode(arg.v & 0xff);
          break;
        case 's':
          s = arg.v === 0 ? '(null)' : this.str(arg, line);
          if (precS) s = s.slice(0, Number(precS));
          break;
        case 'f':
        case 'e':
        case 'g':
          if (arg.t.k !== 'float') throw new CError('runtime', `format '%${conv}' expects a double but the argument is a ${typeName(arg.t)}`, line);
          s = conv === 'e' ? arg.v.toExponential(precS ? Number(precS) : 6) : conv === 'g' ? String(Number(arg.v.toPrecision(precS ? Number(precS) : 6))) : arg.v.toFixed(precS ? Number(precS) : 6);
          break;
        case 'p':
          s = arg.v === 0 ? '(nil)' : '0x' + arg.v.toString(16);
          break;
        default:
          s = (arg.v >>> 0).toString(16);
          if (conv === 'X') s = s.toUpperCase();
          if (flags.includes('#')) s = '0x' + s;
      }
      if (s.length < width) {
        if (flags.includes('-')) s = s.padEnd(width);
        else if (flags.includes('0') && conv !== 's') s = s.startsWith('-') ? '-' + s.slice(1).padStart(width - 1, '0') : s.padStart(width, '0');
        else s = s.padStart(width);
      }
      width = 0;
      out += s;
    }
    return out + fmt.slice(last);
  }

  scan(f: OpenFile, fmt: string, args: Value[], argE: Expr[], line: number): number {
    let count = 0;
    let ai = 0;
    const d = f.data;
    const ws = () => {
      while (f.pos < d.length && /\s/.test(d[f.pos])) f.pos++;
    };
    const atEnd = () => {
      if (f.pos >= d.length) {
        f.eof = true;
        return true;
      }
      return false;
    };
    for (let i = 0; i < fmt.length; i++) {
      const c = fmt[i];
      if (/\s/.test(c)) {
        ws();
        continue;
      }
      if (c !== '%') {
        if (atEnd()) return count || -1;
        if (d[f.pos] !== c) return count;
        f.pos++;
        continue;
      }
      const m = fmt.slice(i).match(/^%(\*)?(\d+)?(hh|h|ll|l)?([dicsf%])/);
      if (!m) throw new CError('runtime', `unsupported scanf format '${fmt.slice(i)}'`, line);
      i += m[0].length - 1;
      const [, skip, , len, conv] = m;
      if (conv === '%') {
        ws();
        if (d[f.pos] !== '%') return count;
        f.pos++;
        continue;
      }
      if (conv !== 'c') ws();
      if (atEnd()) return count || -1;
      let raw: string | null = null;
      let val = 0;
      if (conv === 'd' || conv === 'i') {
        const mm = d.slice(f.pos).match(/^[+-]?\d+/);
        if (!mm) return count;
        raw = mm[0];
        val = Number(raw);
      } else if (conv === 'f') {
        const mm = d.slice(f.pos).match(/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/);
        if (!mm) return count;
        raw = mm[0];
        val = Number(raw);
      } else if (conv === 'c') {
        raw = d[f.pos];
        val = raw.charCodeAt(0);
      } else {
        const mm = d.slice(f.pos).match(/^\S+/)!;
        raw = mm[0];
      }
      f.pos += raw.length;
      if (f.pos >= d.length) f.eof = true;
      if (skip) continue;
      const target = args[ai];
      const te = argE[ai];
      ai++;
      if (!target) throw new CError('runtime', `fscanf: more conversions than arguments`, line);
      if (target.t.k !== 'ptr')
        throw new Fault(`invalid memory access at address ${hex(target.v)} (scanf needs the address of a variable; did you forget the & before ${te && te.k === 'id' ? te.name : 'the argument'}?)`);
      if (conv === 's') this.writeCString(target.v, raw);
      else {
        const tt = target.t.to;
        if (conv === 'f' && tt.k !== 'float') throw new CError('runtime', `format '%f' expects a pointer to a float`, line);
        if ((conv === 'd' || conv === 'i') && tt.k === 'float') throw new CError('runtime', `format '%d' expects a pointer to an int, not a ${typeName(tt)}`, line);
        this.store({ t: tt.k === 'void' ? INT : tt, addr: target.v }, this.convert({ t: conv === 'f' ? DOUBLE : len === 'l' ? LONG : INT, v: val }, tt.k === 'void' ? INT : tt, line));
      }
      count++;
    }
    return count;
  }
}

function kindOf(t: CType): 'int' | 'uint' | 'float' {
  if (t.k === 'float') return 'float';
  if (t.k === 'ptr' || t.k === 'bool') return 'uint';
  if (t.k === 'int' && t.unsigned) return 'uint';
  return 'int';
}

function wrap(n: number, size: number, unsigned: boolean) {
  switch (size) {
    case 1:
      return unsigned ? n & 0xff : (n << 24) >> 24;
    case 2:
      return unsigned ? n & 0xffff : (n << 16) >> 16;
    case 4:
      return unsigned ? n >>> 0 : n | 0;
    default:
      return Math.trunc(n);
  }
}

function compare(op: string, a: number, b: number) {
  switch (op) {
    case '==': return a === b;
    case '!=': return a !== b;
    case '<': return a < b;
    case '>': return a > b;
    case '<=': return a <= b;
    default: return a >= b;
  }
}

export function charLabel(c: number) {
  const map: Record<number, string> = { 0: '\\0', 10: '\\n', 9: '\\t', 13: '\\r', 32: ' ' };
  if (c in map) return `'${map[c]}'`;
  if (c >= 33 && c < 127) return `'${String.fromCharCode(c)}'`;
  return `'\\x${(c & 0xff).toString(16)}'`;
}

export function fmtValue(t: CType, v: number, _mem?: unknown): string {
  switch (t.k) {
    case 'char':
      return charLabel(v);
    case 'ptr':
      return v === 0 ? 'NULL' : hex(v);
    case 'bool':
      return v ? 'true' : 'false';
    case 'float':
      return Number.isInteger(v) ? v.toFixed(1) : String(Number(v.toPrecision(8)));
    default:
      return String(v);
  }
}

export { STACK_TOP };

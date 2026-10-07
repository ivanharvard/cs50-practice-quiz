import { Snapshot } from '../c/interp';
import { SnapView, show, Shown } from '../c/snapview';
import { CType, sizeOf, typeName } from '../c/types';
import { hex } from '../c/memory';

export interface Node {
  path: string;
  name: string;
  t: CType;
  addr: number;
  shown: Shown;
  target?: string | null;
  kids?: () => Node[];
  more?: number;
}

export function viewOf(s: Snapshot, strings?: Map<number, string>) {
  const v = new SnapView(s);
  if (strings) v.strings = [...strings.entries()];
  return v;
}

/** Label for a heap struct like node(20), using its first int field when there is one. */
export function blockLabel(view: SnapView, addr: number): string | null {
  const b = view.blockAt(addr);
  if (!b) return null;
  if (b.info.label) return b.info.label;
  const t = b.info.t;
  if (t && t.k === 'struct' && t.fields) {
    const f = t.fields.find((x) => x.type.k === 'int' || x.type.k === 'char');
    const base = b.addr + Math.floor((addr - b.addr) / sizeOf(t)) * sizeOf(t);
    const c = f ? view.read(base + f.offset, f.type) : null;
    const head = `${typeName(t)}(${c && c.init ? c.v : '?'})`;
    if (addr === base) return head;
    const fld = t.fields.find((x) => base + x.offset === addr);
    return fld ? `${head}.${fld.name}` : head;
  }
  return `heap @${hex(b.addr)}`;
}

export function targetName(view: SnapView, p: number): string | null {
  if (p === 0) return null;
  return blockLabel(view, p) ?? view.nameOf(p);
}

export function makeNode(view: SnapView, path: string, name: string, t: CType, addr: number): Node {
  const shown = show(view, t, addr);
  const n: Node = { path, name, t, addr, shown };
  if (t.k === 'ptr' && shown.kind === 'ptr') {
    const c = view.read(addr, t)!;
    n.target = targetName(view, c.v);
    if (!view.valid(c.v, 1)) n.shown = { text: shown.text, kind: 'dangling' };
    if (t.to.k === 'struct' && view.valid(c.v, sizeOf(t.to))) {
      const to = t.to;
      n.kids = () => to.fields!.map((f) => makeNode(view, `${path}->${f.name}`, `->${f.name}`, f.type, c.v + f.offset));
    } else if (t.to.k === 'char') {
      const s = view.cstring(c.v, 40);
      if (s !== null) n.target = `"${s}"`;
    }
  }
  if (t.k === 'struct' && t.fields) {
    const fields = t.fields;
    n.kids = () => fields.map((f) => makeNode(view, `${path}.${f.name}`, `.${f.name}`, f.type, addr + f.offset));
  }
  if (t.k === 'arr') {
    const es = sizeOf(t.of);
    const max = Math.min(t.len, 12);
    if (t.of.k === 'char') {
      let s = '';
      for (let i = 0; i < Math.min(t.len, 24); i++) {
        const c = view.read(addr + i, t.of);
        if (!c || !c.init) { s += '·'; continue; }
        if (c.v === 0) break;
        s += String.fromCharCode(c.v & 0xff);
      }
      n.shown = { text: `"${s}${t.len > 24 ? '…' : ''}"`, kind: 'aggregate' };
    }
    const of = t.of;
    n.kids = () => Array.from({ length: max }, (_, i) => makeNode(view, `${path}[${i}]`, `[${i}]`, of, addr + i * es));
    n.more = t.len - max;
  }
  return n;
}

/** Flat map of every visible value, used to diff two steps. */
export function flatten(view: SnapView): Map<string, { label: string; text: string; ptr?: string | null; garbage: boolean }> {
  const out = new Map<string, { label: string; text: string; ptr?: string | null; garbage: boolean }>();
  const walk = (key: string, label: string, t: CType, addr: number, depth: number) => {
    if (depth > 3) return;
    if (t.k === 'struct' && t.fields) {
      for (const f of t.fields) walk(`${key}.${f.name}`, `${label}.${f.name}`, f.type, addr + f.offset, depth + 1);
      return;
    }
    if (t.k === 'arr') {
      const es = sizeOf(t.of);
      for (let i = 0; i < Math.min(t.len, 128); i++) walk(`${key}[${i}]`, `${label}[${i}]`, t.of, addr + i * es, depth + 1);
      return;
    }
    if (t.k === 'file') return;
    const s = show(view, t, addr);
    let ptr: string | null | undefined;
    if (t.k === 'ptr' && s.kind === 'ptr') ptr = targetName(view, view.read(addr, t)!.v);
    out.set(key, { label, text: s.text, ptr, garbage: s.kind === 'garbage' });
  };
  view.s.frames.forEach((f, fi) => {
    for (const v of f.vars) walk(`${fi}:${f.fn}:${v.name}`, v.name, v.t, v.addr, 0);
  });
  view.s.blocks.forEach((b) => {
    if (b.freed || !b.info.t || b.info.t.k === 'file') return;
    const t = b.info.t;
    const n = Math.max(1, Math.floor(b.size / sizeOf(t)));
    for (let i = 0; i < Math.min(n, 32); i++) {
      const a = b.addr + i * sizeOf(t);
      walk(`heap:${a}`, blockLabel(view, a) ?? 'heap', t, a, 0);
    }
  });
  return out;
}

export interface Change {
  label: string;
  from: string | null;
  to: string;
}

export function diff(prev: SnapView, cur: SnapView): Change[] {
  const a = flatten(prev);
  const b = flatten(cur);
  const out: Change[] = [];
  for (const [k, v] of b) {
    const o = a.get(k);
    const show = (x: typeof v) => (x.ptr ? `→ ${x.ptr}` : x.text);
    if (!o) {
      if (!v.garbage) out.push({ label: v.label, from: null, to: show(v) });
      continue;
    }
    if (o.text !== v.text || o.garbage !== v.garbage) {
      // heap labels can change when the data field changes; use the new label
      out.push({ label: v.label, from: o.garbage ? 'garbage' : show(o), to: show(v) });
    }
  }
  return out;
}

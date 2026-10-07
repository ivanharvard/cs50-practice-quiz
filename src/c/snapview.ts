import { HeapBlock, Snapshot, VarSnap, fmtValue } from './interp';
import { HEAP_BASE, STACK_TOP, hex } from './memory';
import { CType, sizeOf, typeName } from './types';

export interface Cell {
  v: number;
  init: boolean;
}

/** Reads typed values out of a recorded snapshot. */
export class SnapView {
  constructor(public s: Snapshot) {}

  private locate(addr: number, size: number): [Uint8Array, Uint8Array, number] | null {
    const s = this.s;
    if (addr >= s.stackLo && addr + size <= STACK_TOP) return [s.stack, s.stackInit, addr - s.stackLo];
    if (addr >= HEAP_BASE && addr + size <= HEAP_BASE + s.heap.length) return [s.heap, s.heapInit, addr - HEAP_BASE];
    if (addr >= s.dataBase && addr + size <= s.dataBase + s.data.length) return [s.data, s.dataInit, addr - s.dataBase];
    return null;
  }

  valid(addr: number, size = 1) {
    return this.locate(addr, size) !== null;
  }

  read(addr: number, t: CType): Cell | null {
    const size = sizeOf(t);
    const loc = this.locate(addr, size);
    if (!loc) return null;
    const [bytes, init, o] = loc;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let v: number;
    if (t.k === 'float') v = size === 4 ? dv.getFloat32(o, true) : dv.getFloat64(o, true);
    else if (t.k === 'ptr') v = Number(dv.getBigUint64(o, true));
    else if (t.k === 'char') v = dv.getInt8(o);
    else if (t.k === 'bool') v = dv.getUint8(o);
    else if (t.k === 'int') {
      const u = !!t.unsigned;
      v = size === 1 ? (u ? dv.getUint8(o) : dv.getInt8(o))
        : size === 2 ? (u ? dv.getUint16(o, true) : dv.getInt16(o, true))
        : size === 4 ? (u ? dv.getUint32(o, true) : dv.getInt32(o, true))
        : Number(dv.getBigInt64(o, true));
    } else v = addr;
    let ok = true;
    for (let i = o; i < o + size; i++) if (!init[i]) ok = false;
    return { v, init: ok };
  }

  cstring(addr: number, max = 64): string | null {
    let out = '';
    for (let i = 0; i < max; i++) {
      const c = this.read(addr + i, { k: 'char' });
      if (!c) return null;
      if (c.v === 0) return out;
      out += String.fromCharCode(c.v & 0xff);
    }
    return out + '…';
  }

  get vars(): VarSnap[] {
    return this.s.frames.flatMap((f) => f.vars);
  }

  frameVars(fn: string): VarSnap[] {
    for (let i = this.s.frames.length - 1; i >= 0; i--) if (this.s.frames[i].fn === fn) return this.s.frames[i].vars;
    return [];
  }

  /** Human name for whatever lives at an address: a variable, a field, an element, or a heap block. */
  nameOf(addr: number): string | null {
    if (addr === 0) return null;
    for (let fi = this.s.frames.length - 1; fi >= 0; fi--) {
      for (const v of this.s.frames[fi].vars) {
        const n = pathTo(v.name, v.t, v.addr, addr);
        if (n) return n;
      }
    }
    const b = this.blockAt(addr);
    if (b) {
      if (b.info.label) return b.info.label;
      const t = b.info.t;
      if (t && t.k === 'struct') return `heap ${typeName(t)} @${hex(b.addr)}`;
      return `heap block @${hex(b.addr)}`;
    }
    for (const [a, str] of this.strings) if (addr >= a && addr <= a + str.length) return `"${str}"`;
    return null;
  }

  strings: [number, string][] = [];

  blockAt(addr: number): HeapBlock | undefined {
    return this.s.blocks.find((b) => addr >= b.addr && addr < b.addr + Math.max(1, b.size));
  }
}

function pathTo(name: string, t: CType, base: number, addr: number): string | null {
  const size = sizeOf(t);
  if (addr < base || addr >= base + size) return null;
  if (addr === base && t.k !== 'arr' && t.k !== 'struct') return name;
  if (t.k === 'arr') {
    const es = sizeOf(t.of);
    const i = Math.floor((addr - base) / es);
    return pathTo(`${name}[${i}]`, t.of, base + i * es, addr);
  }
  if (t.k === 'struct' && t.fields) {
    if (addr === base) return name;
    for (const f of t.fields) {
      const r = pathTo(`${name}.${f.name}`, f.type, base + f.offset, addr);
      if (r) return r;
    }
  }
  return addr === base ? name : null;
}

export interface Shown {
  text: string;
  kind: 'value' | 'garbage' | 'null' | 'ptr' | 'dangling' | 'aggregate';
}

export function show(view: SnapView, t: CType, addr: number): Shown {
  if (t.k === 'arr' || t.k === 'struct') return { text: typeName(t), kind: 'aggregate' };
  if (t.k === 'file') return { text: 'FILE', kind: 'aggregate' };
  const c = view.read(addr, t);
  if (!c) return { text: '?', kind: 'dangling' };
  if (!c.init) return { text: fmtValue(t, c.v), kind: 'garbage' };
  if (t.k === 'ptr') {
    if (c.v === 0) return { text: 'NULL', kind: 'null' };
    return { text: hex(c.v), kind: 'ptr' };
  }
  return { text: fmtValue(t, c.v), kind: 'value' };
}

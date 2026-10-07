// A flat, byte addressable memory split into three regions, each with its own base address,
// so pointers look and behave like real addresses.

export interface Region {
  name: 'data' | 'heap' | 'stack';
  base: number;
  bytes: Uint8Array;
  init: Uint8Array;
}

export const DATA_BASE = 0x00404000;
export const HEAP_BASE = 0x5592a2c0;
export const STACK_TOP = 0x7ffd5e40;
const DATA_SIZE = 1 << 16;
const HEAP_SIZE = 1 << 20;
const STACK_SIZE = 1 << 19;

export class Fault extends Error {}

export class Memory {
  data: Region;
  heap: Region;
  stack: Region;
  view = new Map<Region, DataView>();
  dataTop = DATA_BASE;
  brk = HEAP_BASE;
  sp = STACK_TOP;

  constructor() {
    this.data = mk('data', DATA_BASE, DATA_SIZE);
    this.heap = mk('heap', HEAP_BASE, HEAP_SIZE);
    this.stack = mk('stack', STACK_TOP - STACK_SIZE, STACK_SIZE);
    // Stack and heap start out full of leftover bytes, the way real memory does.
    let seed = 0x2f6b1d;
    for (const r of [this.stack, this.heap]) {
      for (let i = 0; i < r.bytes.length; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        r.bytes[i] = (seed >> 16) & 0xff;
      }
    }
    for (const r of [this.data, this.heap, this.stack]) this.view.set(r, new DataView(r.bytes.buffer));
  }

  region(addr: number, len: number): Region {
    for (const r of [this.stack, this.heap, this.data]) {
      if (addr >= r.base && addr + len <= r.base + r.bytes.length) {
        if (r === this.stack && addr < this.sp - 4096) break;
        if (r === this.heap && addr + len > this.brk) break;
        if (r === this.data && addr + len > this.dataTop) break;
        return r;
      }
    }
    throw new Fault(`invalid memory access at address ${hex(addr)}`);
  }

  read(addr: number, size: number, kind: 'int' | 'uint' | 'float'): number {
    const r = this.region(addr, size);
    const v = this.view.get(r)!;
    const o = addr - r.base;
    if (kind === 'float') return size === 4 ? v.getFloat32(o, true) : v.getFloat64(o, true);
    switch (size) {
      case 1:
        return kind === 'int' ? v.getInt8(o) : v.getUint8(o);
      case 2:
        return kind === 'int' ? v.getInt16(o, true) : v.getUint16(o, true);
      case 4:
        return kind === 'int' ? v.getInt32(o, true) : v.getUint32(o, true);
      default:
        return Number(kind === 'int' ? v.getBigInt64(o, true) : v.getBigUint64(o, true));
    }
  }

  write(addr: number, size: number, kind: 'int' | 'uint' | 'float', val: number) {
    const r = this.region(addr, size);
    const v = this.view.get(r)!;
    const o = addr - r.base;
    if (kind === 'float') size === 4 ? v.setFloat32(o, val, true) : v.setFloat64(o, val, true);
    else if (size === 1) v.setUint8(o, val & 0xff);
    else if (size === 2) v.setUint16(o, val & 0xffff, true);
    else if (size === 4) v.setUint32(o, val >>> 0, true);
    else v.setBigInt64(o, BigInt(Math.trunc(val)), true);
    r.init.fill(1, o, o + size);
  }

  isInit(addr: number, size: number) {
    const r = this.region(addr, size);
    const o = addr - r.base;
    for (let i = o; i < o + size; i++) if (!r.init[i]) return false;
    return true;
  }

  copy(dst: number, src: number, n: number) {
    const rs = this.region(src, n);
    const rd = this.region(dst, n);
    const chunk = rs.bytes.slice(src - rs.base, src - rs.base + n);
    const ichunk = rs.init.slice(src - rs.base, src - rs.base + n);
    rd.bytes.set(chunk, dst - rd.base);
    rd.init.set(ichunk, dst - rd.base);
  }

  fill(dst: number, byte: number, n: number) {
    const r = this.region(dst, n);
    r.bytes.fill(byte, dst - r.base, dst - r.base + n);
    r.init.fill(1, dst - r.base, dst - r.base + n);
  }

  readCString(addr: number, max = 1 << 16): string {
    let s = '';
    for (let i = 0; i < max; i++) {
      const c = this.read(addr + i, 1, 'uint');
      if (c === 0) return s;
      s += String.fromCharCode(c);
    }
    return s;
  }

  allocData(size: number, align = 8) {
    this.dataTop = Math.ceil(this.dataTop / align) * align;
    const a = this.dataTop;
    this.dataTop += size;
    if (this.dataTop > DATA_BASE + DATA_SIZE) throw new Fault('out of static memory');
    return a;
  }

  pushStack(size: number, align: number) {
    let sp = this.sp - size;
    sp = Math.floor(sp / align) * align;
    if (sp < this.stack.base + 4096) throw new Fault('stack overflow');
    this.sp = sp;
    return sp;
  }

  sbrk(size: number) {
    const a = Math.ceil(this.brk / 16) * 16 + 16; // leave a header gap like real allocators
    if (a + size > HEAP_BASE + HEAP_SIZE) return 0;
    this.brk = a + size;
    return a;
  }
}

function mk(name: Region['name'], base: number, size: number): Region {
  return { name, base, bytes: new Uint8Array(size), init: new Uint8Array(size) };
}

export const hex = (n: number) => '0x' + (n >>> 0).toString(16).padStart(n > 0xffffff ? 8 : 6, '0');

export interface Field {
  name: string;
  type: CType;
  offset: number;
}

export type CType =
  | { k: 'int'; size: 1 | 2 | 4 | 8; unsigned?: boolean; name: string }
  | { k: 'char' }
  | { k: 'bool' }
  | { k: 'float'; size: 4 | 8 }
  | { k: 'void' }
  | { k: 'ptr'; to: CType }
  | { k: 'arr'; of: CType; len: number }
  | { k: 'struct'; tag: string; alias?: string; fields: Field[] | null; size: number; align: number }
  | { k: 'file' };

export type IntT = Extract<CType, { k: 'int' }>;
export const INT: IntT = { k: 'int', size: 4, name: 'int' };
export const LONG: IntT = { k: 'int', size: 8, name: 'long' };
export const CHAR: CType = { k: 'char' };
export const BOOL: CType = { k: 'bool' };
export const DOUBLE: CType = { k: 'float', size: 8 };
export const VOID: CType = { k: 'void' };
export const FILE_T: CType = { k: 'file' };
export const ptr = (to: CType): CType => ({ k: 'ptr', to });

export function sizeOf(t: CType): number {
  switch (t.k) {
    case 'int':
      return t.size;
    case 'char':
    case 'bool':
      return 1;
    case 'float':
      return t.size;
    case 'void':
      return 1;
    case 'ptr':
      return 8;
    case 'arr':
      return sizeOf(t.of) * t.len;
    case 'struct':
      if (!t.fields) throw new Error(`incomplete type 'struct ${t.tag}'`);
      return t.size;
    case 'file':
      return 216;
  }
}

export function alignOf(t: CType): number {
  switch (t.k) {
    case 'arr':
      return alignOf(t.of);
    case 'struct':
      return t.align;
    case 'file':
      return 8;
    default:
      return Math.min(sizeOf(t), 8);
  }
}

export function layoutStruct(t: Extract<CType, { k: 'struct' }>, fields: { name: string; type: CType }[]) {
  let off = 0;
  let align = 1;
  const out: Field[] = [];
  for (const f of fields) {
    const a = alignOf(f.type);
    off = Math.ceil(off / a) * a;
    out.push({ name: f.name, type: f.type, offset: off });
    off += sizeOf(f.type);
    align = Math.max(align, a);
  }
  t.fields = out;
  t.align = align;
  t.size = Math.ceil(off / align) * align || align;
}

export function typeName(t: CType): string {
  switch (t.k) {
    case 'int':
      return (t.unsigned ? 'unsigned ' : '') + t.name;
    case 'char':
      return 'char';
    case 'bool':
      return 'bool';
    case 'float':
      return t.size === 4 ? 'float' : 'double';
    case 'void':
      return 'void';
    case 'ptr':
      return typeName(t.to) + ' *';
    case 'arr':
      return `${typeName(t.of)}[${t.len}]`;
    case 'struct':
      return t.alias ?? `struct ${t.tag}`;
    case 'file':
      return 'FILE';
  }
}

export const isInteger = (t: CType) => t.k === 'int' || t.k === 'char' || t.k === 'bool';
export const isArith = (t: CType) => isInteger(t) || t.k === 'float';
export const isScalar = (t: CType) => isArith(t) || t.k === 'ptr';

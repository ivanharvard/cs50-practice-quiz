// Tokenizer and a tiny preprocessor (#include is accepted, #define supports object macros).

export type TokKind = 'id' | 'kw' | 'num' | 'char' | 'str' | 'punc' | 'eof';

export interface Token {
  k: TokKind;
  v: string;
  n?: number;
  float?: boolean;
  line: number;
  col: number;
}

export class CError extends Error {
  constructor(
    public kind: 'compile' | 'runtime',
    message: string,
    public line: number | null,
  ) {
    super(message);
  }
}

const KEYWORDS = new Set([
  'int', 'char', 'void', 'float', 'double', 'long', 'short', 'unsigned', 'signed', 'const',
  'static', 'struct', 'typedef', 'if', 'else', 'while', 'do', 'for', 'return', 'break',
  'continue', 'sizeof', 'bool', '_Bool', 'switch', 'case', 'default', 'enum',
]);

const PUNCS = [
  '<<=', '>>=', '...', '->', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
  '{', '}', '(', ')', '[', ']', ';', ',', '.', '<', '>', '+', '-', '*', '/', '%', '&', '|',
  '^', '!', '~', '?', ':', '=',
];

const KNOWN_HEADERS = new Set([
  'stdio.h', 'stdlib.h', 'string.h', 'stdbool.h', 'ctype.h', 'cs50.h', 'math.h', 'stdint.h',
]);

const ESCAPES: Record<string, number> = {
  n: 10, t: 9, r: 13, '0': 0, '\\': 92, "'": 39, '"': 34, a: 7, b: 8, f: 12, v: 11,
};

export function lex(src: string): Token[] {
  const lines = src.split('\n');
  const macros = new Map<string, Token[]>([
    ['NULL', lexRaw('((void *) 0)', 1)],
    ['EOF', lexRaw('(-1)', 1)],
    ['true', lexRaw('1', 1)],
    ['false', lexRaw('0', 1)],
    ['RAND_MAX', lexRaw('2147483647', 1)],
  ]);
  const body: string[] = [];
  lines.forEach((raw, i) => {
    const t = raw.trim();
    if (t.startsWith('#')) {
      const m = t.match(/^#\s*(\w+)\s*(.*)$/);
      const dir = m?.[1];
      if (dir === 'include') {
        const h = m![2].replace(/[<>"]/g, '').trim();
        if (!KNOWN_HEADERS.has(h)) throw new CError('compile', `fatal error: '${h}' file not found`, i + 1);
      } else if (dir === 'define') {
        const dm = m![2].match(/^(\w+)\s*(.*)$/);
        if (!dm) throw new CError('compile', 'macro name missing', i + 1);
        const value = dm[2].replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
        macros.set(dm[1], lexRaw(value, i + 1));
      } else {
        throw new CError('compile', `unsupported preprocessor directive '#${dir}'`, i + 1);
      }
      body.push('');
    } else {
      body.push(raw);
    }
  });
  const toks = lexRaw(body.join('\n'), 1);
  const out: Token[] = [];
  for (const tk of toks) {
    if (tk.k === 'id' && macros.has(tk.v)) {
      for (const m of macros.get(tk.v)!) if (m.k !== 'eof') out.push({ ...m, line: tk.line, col: tk.col });
    } else out.push(tk);
  }
  return out;
}

function lexRaw(src: string, startLine: number): Token[] {
  const toks: Token[] = [];
  let i = 0;
  let line = startLine;
  let lineStart = 0;
  const err = (msg: string) => {
    throw new CError('compile', msg, line);
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') {
      line++;
      i++;
      lineStart = i;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') {
          line++;
          lineStart = i + 1;
        }
        i++;
      }
      if (i >= src.length) err('unterminated /* comment');
      i += 2;
      continue;
    }
    const col = i - lineStart + 1;
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /\w/.test(src[j])) j++;
      const w = src.slice(i, j);
      toks.push({ k: KEYWORDS.has(w) ? 'kw' : 'id', v: w, line, col });
      i = j;
      continue;
    }
    if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1] ?? ''))) {
      let j = i;
      let float = false;
      let n: number;
      if (c === '0' && /[xX]/.test(src[i + 1] ?? '')) {
        j = i + 2;
        while (/[0-9a-fA-F]/.test(src[j] ?? '')) j++;
        n = parseInt(src.slice(i + 2, j), 16);
      } else {
        while (/[\d.]/.test(src[j] ?? '')) {
          if (src[j] === '.') float = true;
          j++;
        }
        if (/[eE]/.test(src[j] ?? '')) {
          float = true;
          j++;
          if (/[+-]/.test(src[j] ?? '')) j++;
          while (/\d/.test(src[j] ?? '')) j++;
        }
        n = Number(src.slice(i, j));
      }
      while (/[uUlLfF]/.test(src[j] ?? '')) {
        if (/[fF]/.test(src[j])) float = true;
        j++;
      }
      toks.push({ k: 'num', v: src.slice(i, j), n, float, line, col });
      i = j;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      let n: number;
      if (src[j] === '\\') {
        const e = src[j + 1];
        if (!(e in ESCAPES)) err(`unknown escape sequence '\\${e}'`);
        n = ESCAPES[e];
        j += 2;
      } else {
        n = src.charCodeAt(j);
        j++;
      }
      if (src[j] !== "'") err('missing terminating \' character');
      toks.push({ k: 'char', v: src.slice(i, j + 1), n, line, col });
      i = j + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\n') err('missing terminating \'"\' character');
        if (src[j] === '\\') {
          const e = src[j + 1];
          if (!(e in ESCAPES)) err(`unknown escape sequence '\\${e}'`);
          s += String.fromCharCode(ESCAPES[e]);
          j += 2;
        } else {
          s += src[j];
          j++;
        }
      }
      if (j >= src.length) err('missing terminating \'"\' character');
      // adjacent string literals concatenate
      const prev = toks[toks.length - 1];
      if (prev && prev.k === 'str') prev.v += s;
      else toks.push({ k: 'str', v: s, line, col });
      i = j + 1;
      continue;
    }
    const p = PUNCS.find((q) => src.startsWith(q, i));
    if (!p) err(`unexpected character '${c}'`);
    toks.push({ k: 'punc', v: p!, line, col });
    i += p!.length;
  }
  toks.push({ k: 'eof', v: '', line, col: 0 });
  return toks;
}

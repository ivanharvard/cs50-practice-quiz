import { Fragment, ReactNode } from 'react';

const KW = new Set([
  'if', 'else', 'while', 'do', 'for', 'return', 'break', 'continue', 'sizeof', 'typedef', 'struct',
  'switch', 'case', 'default', 'const', 'static',
]);
const TYPES = new Set(['int', 'char', 'void', 'float', 'double', 'long', 'short', 'unsigned', 'bool', 'FILE', 'node', 'Node', 'Stack', 'string', 'size_t']);

const RE = /(\/\/.*$|\/\*.*?\*\/|\/\*.*$)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(#\s*\w+.*$)|(\b\d+\b)|([A-Za-z_]\w*)/g;

/** Highlights one line of C. Good enough for display; editing uses CodeMirror. */
export function highlightLine(line: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  RE.lastIndex = 0;
  let i = 0;
  while ((m = RE.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const [tok, com, str, pp, num, id] = m;
    let cls = '';
    if (com) cls = 't-com';
    else if (str) cls = 't-str';
    else if (pp) {
      const inc = pp.match(/^(#\s*\w+)(.*)$/)!;
      out.push(<span key={i++} className="t-pp">{inc[1]}</span>, <span key={i++} className="t-str">{inc[2]}</span>);
      last = RE.lastIndex;
      continue;
    } else if (num) cls = 't-num';
    else if (id && KW.has(id)) cls = 't-kw';
    else if (id && TYPES.has(id)) cls = 't-type';
    out.push(cls ? <span key={i++} className={cls}>{tok}</span> : <Fragment key={i++}>{tok}</Fragment>);
    last = RE.lastIndex;
  }
  if (last < line.length) out.push(line.slice(last));
  return out.length ? out : ' ';
}

export function CodeBlock({ code, numbers = true }: { code: string; numbers?: boolean }) {
  const lines = code.replace(/\n$/, '').split('\n');
  return (
    <pre className={'codeblock' + (numbers ? '' : ' bare')}>
      {lines.map((l, i) => (
        <div className="ln" key={i}>
          <span>{i + 1}</span>
          <span>{highlightLine(l)}</span>
        </div>
      ))}
    </pre>
  );
}

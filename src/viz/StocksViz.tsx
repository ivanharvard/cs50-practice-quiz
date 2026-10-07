import { SnapView } from '../c/snapview';

interface Tok {
  start: number;
  end: number;
  v: number;
}

export function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  const re = /[+-]?\d+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ start: m.index, end: m.index + m[0].length, v: Number(m[0]) });
  return out;
}

function intVar(view: SnapView, name: string): number | null {
  const v = view.frameVars('main').find((x) => x.name === name);
  if (!v) return null;
  const c = view.read(v.addr, v.t);
  return c && c.init ? c.v : null;
}

export function StocksViz({ view, prev, text, output }: { view: SnapView; prev: SnapView | null; text: string; output: string }) {
  const f = view.s.files[0];
  const pos = f ? f.pos : 0;
  const toks = tokenize(text);
  const read = toks.filter((t) => t.end <= pos);
  const lastRead = f ? read[read.length - 1] : undefined;
  const sold = output.slice(0, view.s.outLen).includes('SELL!');
  const prevPos = prev?.s.files[0]?.pos ?? 0;

  const previous = intVar(view, 'previous');
  const current = intVar(view, 'current');
  const declining = intVar(view, 'declining');

  const max = Math.max(1, ...toks.map((t) => t.v));
  const min = Math.min(0, ...toks.map((t) => t.v));
  const W = 560;
  const H = 170;
  const pad = 22;
  const bw = Math.min(36, (W - pad * 2) / Math.max(1, toks.length) - 8);
  const step = (W - pad * 2) / Math.max(1, toks.length);
  const yOf = (v: number) => 20 + (H - 50) * (1 - (v - min) / (max - min || 1));

  const segs: React.ReactNode[] = [];
  let k = 0;
  for (let i = 0; i < text.length; ) {
    const t = toks[k];
    if (t && t.start === i) {
      const isRead = !!f && t.end <= pos;
      const isLast = t === lastRead;
      const justRead = isLast && t.end > prevPos;
      segs.push(
        <span
          key={i}
          style={{
            color: isLast ? 'var(--bg)' : isRead ? 'var(--faint)' : 'var(--text)',
            background: isLast ? (justRead ? 'var(--accent)' : 'var(--text-2)') : 'transparent',
            borderRadius: 3,
            padding: '0 2px',
            margin: '0 -2px',
          }}
        >
          {text.slice(t.start, t.end)}
        </span>,
      );
      i = t.end;
      k++;
    } else {
      const next = t ? t.start : text.length;
      segs.push(<span key={i}>{text.slice(i, next).replace(/ /g, ' ')}</span>);
      i = next;
    }
  }

  return (
    <div>
      <div className="viz-title">
        <span>Inside <b>{f?.name ?? 'the file'}</b>{f ? <>, read position {pos} of {text.length}</> : ', not opened yet'}</span>
        {f?.closed && <span>closed</span>}
      </div>
      <div
        className="mono"
        style={{ whiteSpace: 'pre-wrap', background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 6, padding: '10px 12px', fontSize: 13, lineHeight: 1.7, minHeight: 60 }}
      >
        {segs}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, margin: '16px 0' }}>
        <Stat label="previous" value={previous} prev={prev ? intVar(prev, 'previous') : undefined} />
        <Stat label="current" value={current} prev={prev ? intVar(prev, 'current') : undefined} />
        <div style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '10px 12px' }}>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }} className="mono">declining</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {[0, 1].map((p) => (
              <i key={p} style={{ width: 22, height: 8, borderRadius: 2, background: declining !== null && declining > p ? 'var(--red)' : 'var(--line-2)' }} />
            ))}
            <span className="mono" style={{ fontSize: 18, marginLeft: 4 }}>{declining ?? '?'}</span>
          </div>
        </div>
      </div>

      <div className="viz-title">
        <span>Prices in file order</span>
        {sold ? <span style={{ color: 'var(--red)' }}>SELL! printed</span> : null}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        <line x1={pad - 6} x2={W - pad + 6} y1={H - 30} y2={H - 30} stroke="var(--line-2)" />
        {toks.map((t, i) => {
          const isRead = !!f && t.end <= pos;
          const prevTok = toks[i - 1];
          const down = isRead && prevTok && t.v < prevTok.v;
          const flat = isRead && prevTok && t.v === prevTok.v;
          const x = pad + i * step + (step - bw) / 2;
          const y = yOf(t.v);
          const col = !isRead ? 'transparent' : down ? 'var(--red)' : flat ? 'var(--muted)' : 'var(--blue)';
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={bw}
                height={Math.max(2, H - 30 - y)}
                rx={2}
                fill={isRead ? col : 'transparent'}
                fillOpacity={isRead ? 0.85 : 0}
                stroke={t === lastRead ? 'var(--accent)' : isRead ? 'none' : 'var(--line-2)'}
                strokeWidth={t === lastRead ? 2 : 1}
                strokeDasharray={isRead ? undefined : '3 3'}
              />
              <text x={x + bw / 2} y={y - 6} textAnchor="middle" fontSize="11" fill={isRead ? 'var(--text-2)' : 'var(--faint)'}>{t.v}</text>
              <text x={x + bw / 2} y={H - 12} textAnchor="middle" fontSize="10" fill="var(--faint)">{i + 1}</text>
            </g>
          );
        })}
      </svg>
      <div className="legend">
        <span><i style={{ background: 'var(--blue)' }} />rose</span>
        <span><i style={{ background: 'var(--red)' }} />declined</span>
        <span><i style={{ background: 'var(--muted)' }} />unchanged</span>
        <span><i style={{ border: '1px dashed var(--line-2)' }} />not read yet</span>
      </div>
    </div>
  );
}

function Stat({ label, value, prev }: { label: string; value: number | null; prev?: number | null }) {
  const changed = prev !== undefined && prev !== value;
  return (
    <div style={{ border: `1px solid ${changed ? 'var(--accent)' : 'var(--line)'}`, background: changed ? 'var(--accent-soft)' : 'transparent', borderRadius: 6, padding: '10px 12px' }}>
      <div style={{ fontSize: 11.5, color: 'var(--muted)' }} className="mono">{label}</div>
      <div className="mono" style={{ fontSize: 22, marginTop: 2, color: value === null ? 'var(--faint)' : changed ? 'var(--accent)' : 'var(--text)' }}>
        {value ?? '?'}
      </div>
    </div>
  );
}

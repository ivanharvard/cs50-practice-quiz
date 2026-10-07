import { SnapView } from '../c/snapview';
import { charLabel } from '../c/interp';
import { CType, sizeOf } from '../c/types';

type S = Extract<CType, { k: 'struct' }>;

function findStack(view: SnapView): { addr: number; t: S } | null {
  const isStack = (t: CType): t is S =>
    t.k === 'struct' && !!t.fields?.some((f) => f.type.k === 'arr') && !!t.fields?.some((f) => f.name === 'top');
  for (const f of view.s.frames) {
    for (const v of f.vars) if (isStack(v.t)) return { addr: v.addr, t: v.t };
  }
  return null;
}

export function StackViz({ view, prev }: { view: SnapView; prev: SnapView | null }) {
  const st = findStack(view);
  if (!st) return <div className="empty">The stack variable does not exist yet. Step forward.</div>;
  const itemsF = st.t.fields!.find((f) => f.type.k === 'arr')!;
  const topF = st.t.fields!.find((f) => f.name === 'top')!;
  const arr = itemsF.type as Extract<CType, { k: 'arr' }>;
  const es = sizeOf(arr.of);
  const topC = view.read(st.addr + topF.offset, topF.type);
  const top = topC && topC.init ? topC.v : null;
  const prevTop = prev ? prev.read(st.addr + topF.offset, topF.type) : null;
  const shown = Math.min(arr.len, Math.max(5, (top ?? 0) + 3));
  const CH = 40;
  const CW = 92;
  const X = 70;
  const Y0 = 20;
  const H = Y0 + shown * CH + 50;
  const yOf = (i: number) => Y0 + (shown - 1 - i) * CH;
  const topY = top === null ? null : top < 0 ? yOf(0) + CH + 18 : top < shown ? yOf(top) + CH / 2 : null;
  const topChanged = !!prev && (!prevTop || !prevTop.init || prevTop.v !== top);

  const fr = view.s.frames[view.s.frames.length - 1];
  const activity = fr && (fr.fn === 'push' || fr.fn === 'pop') ? fr : null;
  let incoming: string | null = null;
  if (activity?.fn === 'push') {
    const ch = activity.vars.find((v) => v.t.k === 'char');
    const c = ch ? view.read(ch.addr, ch.t) : null;
    if (c && c.init) incoming = charLabel(c.v);
  }

  return (
    <div>
      <div className="viz-title">
        <span><b>s.items</b> drawn bottom up, slots 0 to {shown - 1} of {arr.len}</span>
        <span>{activity ? <>inside <b>{activity.fn}()</b></> : null}</span>
      </div>
      <svg viewBox={`0 0 360 ${H}`} width="100%" style={{ maxWidth: 400, display: 'block' }}>
        <defs>
          <marker id="ah-top" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={topChanged ? 'var(--accent)' : 'var(--blue)'} />
          </marker>
        </defs>
        {Array.from({ length: shown }, (_, i) => {
          const y = yOf(i);
          const c = view.read(st.addr + itemsF.offset + i * es, arr.of);
          const pc = prev?.read(st.addr + itemsF.offset + i * es, arr.of);
          const live = top !== null && i <= top;
          const init = !!c && c.init;
          const changed = !!prev && init && (!pc || !pc.init || pc.v !== c!.v);
          return (
            <g key={i}>
              <text x={X - 14} y={y + 25} textAnchor="end" fontSize="12" fill="var(--faint)">{i}</text>
              <rect
                x={X}
                y={y + 2}
                width={CW}
                height={CH - 4}
                rx={4}
                fill={live ? (changed ? 'var(--accent-soft)' : 'var(--panel-3)') : 'transparent'}
                stroke={changed ? 'var(--accent)' : live ? 'var(--text-2)' : 'var(--line-2)'}
                strokeDasharray={live ? undefined : '4 4'}
              />
              <text x={X + CW / 2} y={y + 26} textAnchor="middle" fontSize="16" fill={!init ? 'var(--faint)' : live ? 'var(--text)' : 'var(--faint)'}>
                {init ? charLabel(c!.v) : '?'}
              </text>
              {init && !live && (
                <text x={X + CW + 12} y={y + 25} fontSize="11" fill="var(--faint)">stale, not on the stack</text>
              )}
            </g>
          );
        })}
        <line x1={X - 8} y1={yOf(0) + CH + 2} x2={X + CW + 8} y2={yOf(0) + CH + 2} stroke="var(--muted)" strokeWidth={2} />
        {topY !== null && (
          <g>
            <line x1={X + CW + 74} y1={topY} x2={X + CW + 6} y2={topY} stroke={topChanged ? 'var(--accent)' : 'var(--blue)'} strokeWidth={1.8} markerEnd="url(#ah-top)" />
            <text x={X + CW + 80} y={topY + 5} fontSize="13" fill={topChanged ? 'var(--accent)' : 'var(--text)'}>
              top = {top}
            </text>
          </g>
        )}
        {top === null && (
          <text x={X + CW + 16} y={yOf(0) + 25} fontSize="12" fill="var(--faint)">top is uninitialized</text>
        )}
      </svg>
      {incoming && (
        <div className="callout" style={{ marginTop: 6 }}>
          Pushing <b className="mono">{incoming}</b>
        </div>
      )}
      <div className="legend">
        <span><i style={{ background: 'var(--panel-3)', border: '1px solid var(--text-2)' }} />on the stack</span>
        <span><i style={{ border: '1px dashed var(--line-2)' }} />free slot</span>
        <span><i style={{ background: 'var(--accent)' }} />changed by the last line</span>
      </div>
    </div>
  );
}

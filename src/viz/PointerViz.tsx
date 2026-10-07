import { SnapView, show } from '../c/snapview';
import { hex } from '../c/memory';
import { typeName } from '../c/types';

/** Draws one frame's scalar variables as stack memory, with arrows for pointers. */
export function PointerViz({ view, prev, fn = 'main' }: { view: SnapView; prev: SnapView | null; fn?: string }) {
  const vars = view.frameVars(fn).filter((v) => v.t.k !== 'arr' && v.t.k !== 'struct');
  if (!vars.length) return <div className="empty">No variables exist yet. Step forward to watch them get created.</div>;
  const rows = [...vars].sort((a, b) => b.addr - a.addr);
  const RH = 64;
  const top = 34;
  const BX = 196;
  const BW = 132;
  const BH = 40;
  const pos = new Map(rows.map((v, k) => [v.addr, top + k * RH]));
  const prevVals = new Map((prev?.frameVars(fn) ?? []).map((v) => [v.name + v.addr, show(prev!, v.t, v.addr).text]));
  const H = top + rows.length * RH + 6;
  let lane = 0;

  return (
    <div>
      <div className="viz-title">
        <span>Stack frame of <b>{fn}()</b></span>
        <span>higher addresses on top</span>
      </div>
      <svg viewBox={`0 0 460 ${H}`} width="100%" style={{ maxWidth: 520, display: 'block' }}>
        <defs>
          <marker id="ah-blue" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--blue)" />
          </marker>
        </defs>
        <text x={8} y={16} fill="var(--faint)" fontSize="11">address</text>
        <text x={112} y={16} fill="var(--faint)" fontSize="11">name</text>
        <text x={BX} y={16} fill="var(--faint)" fontSize="11">value</text>
        {rows.map((v) => {
          const y = pos.get(v.addr)!;
          const s = show(view, v.t, v.addr);
          const changed = prevVals.has(v.name + v.addr) ? prevVals.get(v.name + v.addr) !== s.text : !!prev;
          const isPtr = v.t.k === 'ptr';
          const stroke = changed ? 'var(--accent)' : isPtr ? 'var(--blue)' : 'var(--line-2)';
          return (
            <g key={v.name + v.addr}>
              <text x={8} y={y + 25} fill="var(--faint)" fontSize="12">{hex(v.addr)}</text>
              <text x={112} y={y + 20} fill="var(--text)" fontSize="15">{v.name}</text>
              <text x={112} y={y + 36} fill="var(--faint)" fontSize="11">{typeName(v.t)}</text>
              <rect x={BX} y={y} width={BW} height={BH} rx={4} fill={changed ? 'var(--accent-soft)' : 'var(--panel-2)'} stroke={stroke} strokeWidth={changed ? 1.5 : 1} />
              <text
                x={BX + BW / 2}
                y={y + 25}
                textAnchor="middle"
                fontSize={isPtr ? 13 : 16}
                fill={s.kind === 'garbage' ? 'var(--faint)' : isPtr ? 'var(--blue)' : changed ? 'var(--accent)' : 'var(--text)'}
              >
                {s.kind === 'garbage' ? '?' : s.text}
              </text>
              {s.kind === 'garbage' && (
                <text x={BX + BW + 10} y={y + 25} fontSize="11" fill="var(--faint)">uninitialized</text>
              )}
            </g>
          );
        })}
        {rows.map((v) => {
          if (v.t.k !== 'ptr') return null;
          const c = view.read(v.addr, v.t);
          if (!c || !c.init || c.v === 0) return null;
          const y1 = pos.get(v.addr)! + BH / 2;
          const ty = pos.get(c.v);
          if (ty === undefined) return null;
          const y2 = ty + BH / 2;
          const x = BX + BW;
          const out = 46 + 22 * lane++;
          return (
            <path
              key={'a' + v.name}
              d={`M${x},${y1} C${x + out},${y1} ${x + out},${y2} ${x + 6},${y2}`}
              fill="none"
              stroke="var(--blue)"
              strokeWidth={1.8}
              markerEnd="url(#ah-blue)"
            />
          );
        })}
      </svg>
      <div className="legend">
        <span><i style={{ background: 'var(--blue)' }} />pointer</span>
        <span><i style={{ background: 'var(--accent)' }} />changed by the last line</span>
      </div>
    </div>
  );
}

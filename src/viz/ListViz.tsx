import { SnapView } from '../c/snapview';
import { CType } from '../c/types';

export interface ListModel {
  nodes: { id: number; value: string; next: number | null | 'garbage'; changed?: boolean; fresh?: boolean }[];
  labels: { name: string; target: number; changed?: boolean }[];
}

const NW = 104;
const GAP = 34;
const NH = 42;

/** Draws nodes in a fixed row and routes each next pointer, so rewiring is easy to see. */
export function ListDiagram({ model, compact = false }: { model: ListModel; compact?: boolean }) {
  const { nodes, labels } = model;
  const x0 = 14;
  const labelRows = Math.max(1, ...nodes.map((n) => labels.filter((l) => l.target === n.id).length));
  const y0 = compact ? 44 : 34 + labelRows * 18 + 20;
  const index = new Map(nodes.map((n, k) => [n.id, k]));
  const xOf = (k: number) => x0 + k * (NW + GAP);
  const below: { from: number; to: number; changed?: boolean }[] = [];
  nodes.forEach((n, k) => {
    if (typeof n.next === 'number' && index.has(n.next) && index.get(n.next) !== k + 1) below.push({ from: k, to: index.get(n.next)! });
  });
  const depth = below.length ? 30 + below.length * 16 : 0;
  const W = x0 + nodes.length * (NW + GAP);
  const H = y0 + NH + depth + 14;
  const mk = compact ? 'ahc' : 'ah';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: compact ? 520 : 680, display: 'block' }}>
      <defs>
        <marker id={mk + '-b'} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--blue)" />
        </marker>
        <marker id={mk + '-a'} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
        </marker>
      </defs>
      {nodes.map((n, k) => {
        const x = xOf(k);
        const tags = labels.filter((l) => l.target === n.id);
        return (
          <g key={n.id}>
            {tags.map((t, j) => {
              const ty = y0 - 26 - (tags.length - 1 - j) * 18;
              return (
                <text key={t.name} x={x + 26} y={ty} textAnchor="middle" fontSize="13" fill={t.changed ? 'var(--accent)' : 'var(--text)'} fontWeight={t.name === 'head' ? 600 : 400}>
                  {t.name}
                </text>
              );
            })}
            {tags.length > 0 && (
              <line x1={x + 26} y1={y0 - 20} x2={x + 26} y2={y0 - 3} stroke={tags.some((t) => t.changed) ? 'var(--accent)' : 'var(--blue)'} strokeWidth={1.8} markerEnd={`url(#${mk}-${tags.some((t) => t.changed) ? 'a' : 'b'})`} />
            )}
            <rect x={x} y={y0} width={NW} height={NH} rx={4} fill={n.fresh ? 'var(--accent-soft)' : 'var(--panel-2)'} stroke={n.changed ? 'var(--accent)' : 'var(--line-2)'} strokeWidth={n.changed ? 1.5 : 1} />
            <line x1={x + 56} y1={y0} x2={x + 56} y2={y0 + NH} stroke={n.changed ? 'var(--accent)' : 'var(--line-2)'} />
            <text x={x + 28} y={y0 + 27} textAnchor="middle" fontSize="16" fill="var(--text)">{n.value}</text>
            {n.next === null && <line x1={x + 62} y1={y0 + NH - 6} x2={x + NW - 6} y2={y0 + 6} stroke="var(--muted)" strokeWidth={1.6} />}
            {n.next === 'garbage' && <text x={x + 80} y={y0 + 27} textAnchor="middle" fontSize="14" fill="var(--faint)">?</text>}
            {typeof n.next === 'number' && <circle cx={x + 80} cy={y0 + NH / 2} r={3} fill={n.changed ? 'var(--accent)' : 'var(--blue)'} />}
            {typeof n.next === 'number' && index.get(n.next) === k + 1 && (
              <line x1={x + 83} y1={y0 + NH / 2} x2={xOf(k + 1) - 3} y2={y0 + NH / 2} stroke={n.changed ? 'var(--accent)' : 'var(--blue)'} strokeWidth={1.8} markerEnd={`url(#${mk}-${n.changed ? 'a' : 'b'})`} />
            )}
          </g>
        );
      })}
      {below.map((b, j) => {
        const n = nodes[b.from];
        const sx = xOf(b.from) + 80;
        const tx = xOf(b.to) + 40;
        const d = 30 + j * 16;
        const yb = y0 + NH;
        const col = n.changed ? 'var(--accent)' : 'var(--blue)';
        return (
          <path
            key={'b' + j}
            d={`M${sx},${y0 + NH / 2 + 3} L${sx},${yb + d} L${tx},${yb + d} L${tx},${yb + 4}`}
            fill="none"
            stroke={col}
            strokeWidth={1.8}
            strokeLinejoin="round"
            markerEnd={`url(#${mk}-${n.changed ? 'a' : 'b'})`}
          />
        );
      })}
    </svg>
  );
}

function isListStruct(t: CType | null): t is Extract<CType, { k: 'struct' }> {
  return !!t && t.k === 'struct' && !!t.fields?.some((f) => f.type.k === 'ptr' && f.type.to === t);
}

export function listModel(view: SnapView, prev: SnapView | null): ListModel | null {
  const blocks = view.s.blocks.filter((b) => !b.freed && isListStruct(b.info.t)).sort((a, b) => a.addr - b.addr);
  if (!blocks.length) return null;
  const st = blocks[0].info.t as Extract<CType, { k: 'struct' }>;
  const valF = st.fields!.find((f) => f.type.k === 'int' || f.type.k === 'char')!;
  const nextF = st.fields!.find((f) => f.type.k === 'ptr' && f.type.to === st)!;
  const ids = new Set(blocks.map((b) => b.addr));
  const prevIds = new Set(prev?.s.blocks.filter((b) => !b.freed).map((b) => b.addr) ?? []);
  const read = (v: SnapView, addr: number) => {
    const val = v.read(addr + valF.offset, valF.type);
    const nx = v.read(addr + nextF.offset, nextF.type);
    return {
      value: val && val.init ? String(val.v) : '?',
      next: !nx || !nx.init ? ('garbage' as const) : nx.v === 0 ? null : nx.v,
    };
  };
  const nodes = blocks.map((b) => {
    const cur = read(view, b.addr);
    let changed = false;
    if (prev && prevIds.has(b.addr)) {
      const p = read(prev, b.addr);
      changed = p.next !== cur.next || p.value !== cur.value;
    }
    const next = typeof cur.next === 'number' && !ids.has(cur.next) ? ('garbage' as const) : cur.next;
    return { id: b.addr, value: cur.value, next, changed, fresh: !!prev && !prevIds.has(b.addr) };
  });
  const labels: ListModel['labels'] = [];
  const seen = new Set<string>();
  const ptrT = (t: CType) => t.k === 'ptr' && t.to === st;
  for (let fi = view.s.frames.length - 1; fi >= 0; fi--) {
    for (const v of view.s.frames[fi].vars) {
      if (!ptrT(v.t) || seen.has(v.name)) continue;
      const c = view.read(v.addr, v.t);
      if (!c || !c.init || !ids.has(c.v)) continue;
      seen.add(v.name);
      const pc = prev?.read(v.addr, v.t);
      labels.push({ name: v.name, target: c.v, changed: !!prev && (!pc || !pc.init || pc.v !== c.v) });
    }
  }
  return { nodes, labels };
}

export function readFromHead(model: ListModel): string[] | null {
  const head = model.labels.find((l) => l.name === 'head');
  if (!head) return null;
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const out: string[] = [];
  const seen = new Set<number>();
  let cur: number | null | 'garbage' = head.target;
  while (typeof cur === 'number') {
    if (seen.has(cur)) {
      out.push('cycle');
      return out;
    }
    seen.add(cur);
    const n = byId.get(cur);
    if (!n) break;
    out.push(n.value);
    cur = n.next;
  }
  out.push(cur === 'garbage' ? '?' : 'NULL');
  return out;
}

export function ListViz({ view, prev }: { view: SnapView; prev: SnapView | null }) {
  const model = listModel(view, prev);
  if (!model) return <div className="empty">No nodes on the heap yet. Step forward to watch the list get built.</div>;
  const chain = readFromHead(model);
  return (
    <div>
      <div className="viz-title">
        <span>Heap nodes, in the order they were allocated</span>
      </div>
      <ListDiagram model={model} />
      {chain && (
        <div style={{ marginTop: 18 }}>
          <div className="viz-title"><span>Following <b>next</b> pointers from <b>head</b></span></div>
          <div className="mono" style={{ fontSize: 15, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {chain.map((c, k) => (
              <span key={k} style={{ display: 'inline-flex', gap: 10, color: c === 'NULL' ? 'var(--muted)' : c === 'cycle' ? 'var(--red)' : 'var(--text)' }}>
                {c === 'cycle' ? 'loops back forever' : c}
                {k < chain.length - 1 && <span style={{ color: 'var(--blue)' }}>→</span>}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="legend">
        <span><i style={{ background: 'var(--blue)' }} />pointer</span>
        <span><i style={{ background: 'var(--accent)' }} />changed by the last line</span>
        <span><svg width="12" height="12"><line x1="1" y1="11" x2="11" y2="1" stroke="var(--muted)" strokeWidth="1.6" /></svg>NULL</span>
      </div>
    </div>
  );
}

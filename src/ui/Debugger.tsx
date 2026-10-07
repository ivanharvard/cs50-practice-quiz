import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronRight, CircleAlert, Eye, FastForward, ListTree, MessageSquareText, Pause, Play,
  Rewind, StepBack, StepForward, SquareTerminal, History,
} from 'lucide-react';
import { RunResult } from '../c/interp';
import { SnapView } from '../c/snapview';
import { typeName } from '../c/types';
import { highlightLine } from './highlight';
import { Change, Node, diff, flatten, makeNode, viewOf } from './inspect';
import { Terminal } from './Terminal';

export type Notes = Record<string, ReactNode>;

export interface DebuggerProps {
  source: string;
  result: RunResult;
  notes?: Notes;
  visual?: (view: SnapView, ctx: { prev: SnapView | null; result: RunResult; index: number }) => ReactNode;
  visualLabel?: string;
  startLine?: string;
  command: string;
}

const SPEEDS = [900, 450, 180];

export function Debugger({ source, result, notes = {}, visual, visualLabel = 'Visual', startLine, command }: DebuggerProps) {
  const lines = useMemo(() => source.split('\n'), [source]);
  const steps = result.steps;
  const startIdx = useMemo(() => {
    if (!startLine) return 0;
    const i = steps.findIndex((s) => s.line && lines[s.line - 1]?.trim() === startLine);
    return i < 0 ? 0 : i;
  }, [steps, lines, startLine]);
  const [idx, setIdx] = useState(startIdx);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [tab, setTab] = useState<'visual' | 'vars' | 'out'>(visual ? 'visual' : 'vars');
  const [bps, setBps] = useState<Set<number>>(new Set());
  const codeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIdx(startIdx);
    setPlaying(false);
  }, [result, startIdx]);

  const last = steps.length - 1;
  const i = Math.min(idx, Math.max(0, last));
  const snap = steps[i];
  const view = useMemo(() => (snap ? viewOf(snap, result.strings) : null), [snap, result.strings]);
  const prev = useMemo(() => (i > 0 ? viewOf(steps[i - 1], result.strings) : null), [i, steps, result.strings]);

  useEffect(() => {
    if (!playing) return;
    if (i >= last) {
      setPlaying(false);
      return;
    }
    const h = setTimeout(() => {
      const n = i + 1;
      setIdx(n);
      if (steps[n]?.line && bps.has(steps[n].line!)) setPlaying(false);
    }, SPEEDS[speed]);
    return () => clearTimeout(h);
  }, [playing, i, last, speed, bps, steps]);

  useEffect(() => {
    const el = codeRef.current?.querySelector('.ln.cur') as HTMLElement | null;
    const box = codeRef.current;
    if (el && box) {
      const top = el.offsetTop - box.clientHeight / 2 + 20;
      box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  }, [i]);

  const go = (n: number) => {
    setPlaying(false);
    setIdx(Math.max(0, Math.min(last, n)));
  };
  const cont = () => {
    for (let n = i + 1; n <= last; n++) {
      if (steps[n].line && bps.has(steps[n].line!)) return go(n);
    }
    go(last);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, .cm-editor, select')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (result.error?.kind === 'compile' || !snap || !view) {
    return (
      <div className="dbg">
        <div className="err-box">
          <CircleAlert size={16} color="var(--red)" />
          <div>
            <div className="k">Nothing to step through yet</div>
            {result.error ? `The code does not compile: ${result.error.message}${result.error.line ? ` (line ${result.error.line})` : ''}` : 'Run the program first.'}
          </div>
        </div>
      </div>
    );
  }

  const changes: Change[] = prev ? diff(prev, view) : [];
  const changedKeys = new Set<string>();
  if (prev) {
    const a = flatten(prev);
    for (const [k, v] of flatten(view)) {
      const o = a.get(k);
      if (!o || o.text !== v.text || o.garbage !== v.garbage) changedKeys.add(k);
    }
  }
  const printed = prev ? result.output.slice(prev.s.outLen, snap.outLen) : '';
  const prevLine = prev?.s.line ?? null;
  const ended = snap.line === null;
  const errLine = ended && result.error ? result.error.line : null;
  const curText = snap.line ? lines[snap.line - 1]?.trim() : '';
  const note = snap.line ? notes[curText] : null;

  return (
    <div className="dbg">
      <div className="dbg-bar">
        <button className="icon-btn" title="Restart" onClick={() => go(0)} disabled={i === 0}>
          <Rewind size={16} />
        </button>
        <button className="icon-btn" title="Step back (Left arrow)" onClick={() => go(i - 1)} disabled={i === 0}>
          <StepBack size={16} />
        </button>
        <button
          className="icon-btn play"
          title={playing ? 'Pause' : 'Play'}
          onClick={() => {
            if (i >= last) setIdx(0);
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button className="icon-btn" title="Step (Right arrow)" onClick={() => go(i + 1)} disabled={i >= last}>
          <StepForward size={16} />
        </button>
        <button className="icon-btn" title={bps.size ? 'Continue to next breakpoint' : 'Run to end'} onClick={cont} disabled={i >= last}>
          <FastForward size={16} />
        </button>
        <button className="icon-btn" title="Playback speed" onClick={() => setSpeed((speed + 1) % SPEEDS.length)}>
          <span className="speed">{['1x', '2x', '5x'][speed]}</span>
        </button>
        <input
          className="scrub"
          type="range"
          min={0}
          max={last}
          value={i}
          onChange={(e) => go(Number(e.target.value))}
          aria-label="Timeline"
        />
        <span className="counter">
          step {i + 1} / {steps.length}
          {result.truncated ? '+' : ''}
        </span>
      </div>

      <div className="dbg-main">
        <div className="dbg-code" ref={codeRef}>
          {lines.map((l, n) => {
            const no = n + 1;
            const cls = ['ln'];
            if (snap.line === no) cls.push('cur');
            else if (prevLine === no) cls.push('prev');
            if (errLine === no) cls.push('hit');
            return (
              <div className={cls.join(' ')} key={n}>
                <span
                  className="bp"
                  title="Toggle breakpoint"
                  onClick={() => {
                    const s = new Set(bps);
                    s.has(no) ? s.delete(no) : s.add(no);
                    setBps(s);
                  }}
                >
                  <i className={bps.has(no) ? 'on' : ''} />
                </span>
                <span className="no">{no}</span>
                <span>{highlightLine(l)}</span>
              </div>
            );
          })}
        </div>
        <div className="dbg-side">
          <div className="tabs" role="tablist">
            {visual && (
              <button className={tab === 'visual' ? 'on' : ''} onClick={() => setTab('visual')}>
                <Eye size={14} /> {visualLabel}
              </button>
            )}
            <button className={tab === 'vars' ? 'on' : ''} onClick={() => setTab('vars')}>
              <ListTree size={14} /> Variables
            </button>
            <button className={tab === 'out' ? 'on' : ''} onClick={() => setTab('out')}>
              <SquareTerminal size={14} /> Output
            </button>
          </div>
          <div className="tab-body">
            {tab === 'visual' && visual && visual(view, { prev, result, index: i })}
            {tab === 'vars' && <Vars view={view} changed={changedKeys} />}
            {tab === 'out' && (
              <Terminal
                command={command}
                output={result.output.slice(0, snap.outLen)}
                running={!ended}
                exitCode={ended ? result.exitCode : undefined}
                error={ended ? result.error : null}
              />
            )}
          </div>
        </div>
      </div>

      <div className="narr">
        <div>
          <div className="lbl">
            <MessageSquareText size={12} />
            {ended ? 'Finished' : `Line ${snap.line}, about to run`}
          </div>
          <div className="note">
            {ended ? (
              result.error ? (
                <span style={{ color: 'var(--red)' }}>
                  {result.error.message}
                  {result.error.line ? ` on line ${result.error.line}.` : ''}
                </span>
              ) : (
                <>The program ended with exit status <code>{result.exitCode}</code>.</>
              )
            ) : (
              note ?? <span style={{ color: 'var(--muted)' }}><code>{curText}</code></span>
            )}
          </div>
        </div>
        <div>
          <div className="lbl">
            <History size={12} />
            {prevLine ? `What line ${prevLine} just did` : 'What just happened'}
          </div>
          <div className="changes">
            {snap.events.map((e, k) => (
              <div className="c" key={'e' + k}>
                <span className="ev">{e}</span>
              </div>
            ))}
            {printed && (
              <div className="c">
                <span className="ev">printed</span>
                <span className="new">{JSON.stringify(printed)}</span>
              </div>
            )}
            {changes.slice(0, 8).map((c, k) => (
              <div className="c" key={k}>
                <span className="name">{c.label}</span>
                {c.from !== null && <span className="old">{c.from}</span>}
                <span className="new">{c.from === null ? '= ' : ''}{c.to}</span>
              </div>
            ))}
            {changes.length > 8 && <div className="c none">and {changes.length - 8} more</div>}
            {!changes.length && !printed && !snap.events.length && (
              <div className="c none">{i === 0 ? 'Nothing yet. Press the step button or the right arrow key.' : 'No values changed.'}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Vars({ view, changed }: { view: SnapView; changed: Set<string> }) {
  const frames = view.s.frames;
  if (!frames.length) return <div className="empty">The program has exited. All of its stack frames are gone.</div>;
  return (
    <div className="vars">
      {[...frames].reverse().map((f, ri) => {
        const fi = frames.length - 1 - ri;
        return (
          <div className={'frame' + (ri === 0 ? ' top' : '')} key={fi}>
            <div className="frame-head">
              <span className="fn">{f.fn}()</span>
              <span>line {f.line}</span>
            </div>
            {f.vars.length === 0 && <div className="empty">no local variables yet</div>}
            {f.vars.map((v) => (
              <VarRow key={v.name + v.addr} node={makeNode(view, `${fi}:${f.fn}:${v.name}`, v.name, v.t, v.addr)} changed={changed} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function VarRow({ node, changed, depth = 0 }: { node: Node; changed: Set<string>; depth?: number }) {
  const [open, setOpen] = useState(depth === 0 && node.t.k === 'struct');
  const isChanged = changed.has(node.path) || [...changed].some((k) => k.startsWith(node.path + '.') || k.startsWith(node.path + '['));
  return (
    <>
      <div className={'var' + (changed.has(node.path) ? ' changed' : '')} title={`${typeName(node.t)} at ${'0x' + node.addr.toString(16)}`}>
        <span className="tw" onClick={() => setOpen(!open)}>
          {node.kids ? open ? <ChevronDown size={13} /> : <ChevronRight size={13} color={isChanged ? 'var(--accent)' : undefined} /> : null}
        </span>
        <span className="nm">
          {node.name} <span className="ty">{typeName(node.t)}</span>
        </span>
        <span />
        <span className={'vl ' + node.shown.kind}>
          {node.shown.kind === 'garbage' ? <span title="Never assigned. This is leftover memory.">{node.shown.text} ?</span> : node.shown.text}
          {node.target && <span className="to"> → {node.target}</span>}
        </span>
      </div>
      {open && node.kids && depth < 4 && (
        <div className="kids">
          {node.kids().map((k) => (
            <VarRow key={k.path} node={k} changed={changed} depth={depth + 1} />
          ))}
          {node.more ? <div className="empty" style={{ padding: '3px 0' }}>{node.more} more elements</div> : null}
        </div>
      )}
    </>
  );
}

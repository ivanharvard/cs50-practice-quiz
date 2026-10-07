import { ReactNode, useState } from 'react';
import { Check, CircleCheck, CircleX, Eye, Lock, Play, RotateCcw, X } from 'lucide-react';
import { Editor } from '../ui/Editor';
import { Terminal } from '../ui/Terminal';
import { RunResult } from '../c/interp';

export interface Choice {
  key: string;
  body: ReactNode;
  why: ReactNode;
}

export function Choices({
  choices,
  answer,
  selected,
  checked,
  onSelect,
  onCheck,
  onRetry,
}: {
  choices: Choice[];
  answer: string;
  selected?: string;
  checked?: boolean;
  onSelect: (k: string) => void;
  onCheck: () => void;
  onRetry: () => void;
}) {
  const right = checked && selected === answer;
  return (
    <div>
      <div className="choices" role="radiogroup">
        {choices.map((c) => {
          const cls = ['choice'];
          let mark: ReactNode = null;
          if (checked) {
            if (c.key === answer) {
              cls.push('correct');
              mark = <Check size={18} />;
            } else if (c.key === selected) {
              cls.push('wrong');
              mark = <X size={18} />;
            }
          } else if (c.key === selected) cls.push('selected');
          const showWhy = checked && (c.key === answer || c.key === selected);
          return (
            <button key={c.key} className={cls.join(' ')} disabled={checked} onClick={() => onSelect(c.key)} role="radio" aria-checked={c.key === selected}>
              <span className="key">{c.key}</span>
              <span className="body">
                <span className="val">{c.body}</span>
                {showWhy && <div className="why">{c.why}</div>}
              </span>
              <span className="mark">{mark}</span>
            </button>
          );
        })}
      </div>
      <div className="toolbar" style={{ marginTop: 16 }}>
        {!checked ? (
          <button className="btn primary" disabled={!selected} onClick={onCheck}>
            <Check size={16} /> Check answer
          </button>
        ) : (
          <>
            <div className={'verdict ' + (right ? 'good' : 'bad')} style={{ marginTop: 0 }}>
              {right ? <CircleCheck size={18} /> : <CircleX size={18} />}
              {right ? 'Correct. Five points.' : `Not quite. The answer is ${answer}.`}
            </div>
            <button className="btn ghost" onClick={onRetry}>
              <RotateCcw size={15} /> Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function Section({ title, icon, right, children }: { title: string; icon?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>
          {icon}
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Gate({ open, onOpen, label, children }: { open: boolean; onOpen: () => void; label: string; children: ReactNode }) {
  if (open) return <>{children}</>;
  return (
    <div className="panel" style={{ padding: '28px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', color: 'var(--text-2)' }}>
        <Lock size={18} color="var(--muted)" />
        <span>{label}</span>
      </div>
      <button className="btn" onClick={onOpen}>
        <Eye size={16} /> Show it anyway
      </button>
    </div>
  );
}

export function Runner({
  code,
  onChange,
  onRun,
  onReset,
  result,
  command,
  title = 'program.c',
  extra,
  dirty,
}: {
  code: string;
  onChange: (s: string) => void;
  onRun: () => void;
  onReset: () => void;
  result: RunResult | null;
  command: string;
  title?: string;
  extra?: ReactNode;
  dirty?: boolean;
}) {
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title mono" style={{ textTransform: 'none', letterSpacing: 0 }}>{title}</span>
          <div className="toolbar">
            {extra}
            <button className="icon-btn" title="Reset to the original code" onClick={onReset}>
              <RotateCcw size={15} />
            </button>
            <button className="btn primary" onClick={onRun} title="Compile and run (Ctrl or Cmd + Enter)">
              <Play size={15} /> Run
            </button>
          </div>
        </div>
        <Editor value={code} onChange={onChange} onRun={onRun} />
      </div>
      <div className="panel" style={{ position: 'sticky', top: 20 }}>
        <div className="panel-head">
          <span className="panel-title">Terminal</span>
          <RunStatus result={result} dirty={dirty} />
        </div>
        {result ? (
          <Terminal command={command} output={result.output} exitCode={result.exitCode} error={result.error} />
        ) : (
          <div className="term"><span className="prompt">$ </span><span className="cursor" /></div>
        )}
      </div>
    </div>
  );
}

export function RunStatus({ result, dirty }: { result: RunResult | null; dirty?: boolean }) {
  if (!result) return <span className="status idle">not run yet</span>;
  if (dirty) return <span className="status idle">edited since last run</span>;
  if (result.error?.kind === 'compile') return <span className="status bad"><CircleX size={14} /> does not compile</span>;
  if (result.error) return <span className="status bad"><CircleX size={14} /> crashed</span>;
  return <span className="status ok"><CircleCheck size={14} /> ran, exit {result.exitCode}</span>;
}

export function useRunner(initial: string, exec: (src: string) => RunResult, saved?: string, onSave?: (s: string) => void) {
  const [code, setCode] = useState(saved ?? initial);
  const [ran, setRan] = useState<{ src: string; result: RunResult }>(() => {
    const src = saved ?? initial;
    return { src, result: exec(src) };
  });
  return {
    code,
    setCode: (s: string) => {
      setCode(s);
      onSave?.(s);
    },
    ran,
    run: (src = code) => setRan({ src, result: exec(src) }),
    dirty: code !== ran.src,
  };
}

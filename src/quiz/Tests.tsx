import { CircleCheck, CircleDashed, CircleX, FlaskConical } from 'lucide-react';

export interface TestResult {
  name: string;
  detail?: string;
  expected: string;
  got: string | null;
  pass: boolean | null;
}

const vis = (s: string) => s.replace(/\n/g, '↵\n').replace(/\n$/, '');

export function TestsPanel({ results, onRun, points, dirty }: { results: TestResult[]; onRun: () => void; points: number; dirty: boolean }) {
  const ran = results.some((r) => r.pass !== null);
  const passed = results.filter((r) => r.pass).length;
  const earned = ran ? Math.round((points * passed) / results.length) : null;
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">
          Checks {ran && <span className="mono" style={{ color: passed === results.length ? 'var(--green)' : 'var(--text-2)', letterSpacing: 0 }}>{passed} of {results.length} passing</span>}
        </span>
        <div className="toolbar">
          {earned !== null && <span className="status idle">{earned} / {points} points{dirty ? ', code edited since' : ''}</span>}
          <button className="btn" onClick={onRun}>
            <FlaskConical size={15} /> Run checks
          </button>
        </div>
      </div>
      <table className="tests">
        <tbody>
          {results.map((r) => (
            <tr key={r.name}>
              <td className="icon">
                {r.pass === null ? <CircleDashed size={16} className="pend" /> : r.pass ? <CircleCheck size={16} className="pass" /> : <CircleX size={16} className="fail" />}
              </td>
              <td>
                <div>{r.name}</div>
                {r.detail && <div style={{ color: 'var(--faint)', fontSize: 12.5 }}>{r.detail}</div>}
              </td>
              <td>
                <div className="exp">expects {vis(r.expected)}</div>
                {r.pass === false && <div className="got">got {r.got === null ? 'nothing' : vis(r.got) || '(no output)'}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Bug, ClipboardPaste, Code2, Database, Dices, KeyRound } from 'lucide-react';
import { RunOptions, run } from '../c/interp';
import { CodeBlock } from '../ui/highlight';
import { Debugger } from '../ui/Debugger';
import { StocksViz, tokenize } from '../viz/StocksViz';
import { Gate, Runner, Section, useRunner } from './parts';
import { Q4_NOTES } from './notes';
import { PRICE_SETS, Q4_SOLUTION, Q4_STARTER, randomPrices } from './programs';
import { TestResult, TestsPanel } from './Tests';
import { QuestionProps } from './types';

const FILE = 'prices.txt';

function opts(text: string, arg: string): RunOptions {
  return { args: ['stocks', ...(arg.trim() ? arg.trim().split(/\s+/) : [])], files: { [FILE]: text } };
}

/** What a correct program should do with this data, worked out directly. */
function verdict(text: string) {
  const v = tokenize(text).map((t) => t.v);
  let streak = 0;
  for (let i = 1; i < v.length; i++) {
    streak = v[i] < v[i - 1] ? streak + 1 : 0;
    if (streak === 2) return { sell: true, at: i, value: v[i], count: v.length };
  }
  return { sell: false, at: -1, value: 0, count: v.length };
}

const CASES = [
  ...PRICE_SETS.map((s) => ({ name: s.name, text: s.text, arg: FILE, detail: s.text.trim().split(/\s+/).join(' ') })),
  { name: 'File does not exist', text: '', arg: 'missing.txt', detail: '$ ./stocks missing.txt' },
];

function check(code: string): TestResult[] {
  return CASES.map((c) => {
    const want = run(Q4_SOLUTION, { ...opts(c.text, c.arg), record: false }).output;
    const r = run(code, { ...opts(c.text, c.arg), record: false, maxSteps: 100000 });
    const got = r.error?.kind === 'compile' ? `a compile error${r.error.line ? ` on line ${r.error.line}` : ''}: ${r.error.message}` : r.error ? `${r.output}${r.error.message}` : r.output;
    return { name: c.name, detail: c.detail, expected: want, got, pass: !r.error && r.output === want };
  });
}

export function Q4({ p, update }: QuestionProps) {
  const [text, setText] = useState(PRICE_SETS[0].text);
  const [preset, setPreset] = useState<string | null>('quiz');
  const [arg, setArg] = useState(FILE);
  const exec = (src: string) => run(src, opts(text, arg));
  const r = useRunner(Q4_STARTER, exec, p.code[4], (s) => update('code', 4, s));
  const [results, setResults] = useState<TestResult[]>(() => CASES.map((c) => ({ name: c.name, detail: c.detail, expected: '', got: null, pass: null })));
  const [testedSrc, setTestedSrc] = useState<string | null>(null);
  const [which, setWhich] = useState<'mine' | 'solution'>('mine');
  const revealed = !!p.revealed[4];
  const solution = useMemo(() => run(Q4_SOLUTION, opts(text, arg)), [text, arg]);
  const v = verdict(text);
  const toks = tokenize(text);

  useEffect(() => {
    r.run(r.ran.src);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, arg]);

  useEffect(() => {
    setResults(check(Q4_SOLUTION).map((x) => ({ ...x, got: null, pass: null })));
  }, []);

  const runChecks = () => {
    const res = check(r.code);
    setResults(res);
    setTestedSrc(r.code);
    update('tests', 4, [res.filter((x) => x.pass).length, res.length]);
    r.run();
  };

  const command = `./stocks ${arg}`.trim();
  const showSolution = which === 'solution' && revealed;
  const max = Math.max(1, ...toks.map((t) => t.v));

  return (
    <>
      <div className="prose">
        <p>
          Write the missing body of a <code>while</code> loop in a C program that reads a text file of integers, the prices of a
          stock on successive days.
        </p>
        <p>
          As soon as the price declines on <strong>two successive days</strong>, it prints <code>SELL!</code> and halts. A price that
          stays the same does not count as a decline. If that never happens, it prints <code>Do NOT Sell!</code>
        </p>
        <p>
          The numbers can be spread across lines with any amount of whitespace between them. The file name comes from the command
          line, as in <code>./stocks prices.txt</code>. Do not read the data into an array. Track only the most recent value and the
          one before it. You may assume the file holds at least two integers.
        </p>
      </div>

      <Section title="Data" icon={<Database size={14} />}>
        <div className="panel">
          <div className="panel-head">
            <div className="presets">
              {PRICE_SETS.map((s) => (
                <button
                  key={s.id}
                  className={'preset' + (preset === s.id ? ' on' : '')}
                  onClick={() => {
                    setText(s.text);
                    setPreset(s.id);
                  }}
                >
                  {s.name}
                </button>
              ))}
              <button
                className={'preset' + (preset === 'random' ? ' on' : '')}
                onClick={() => {
                  setText(randomPrices());
                  setPreset('random');
                }}
              >
                <Dices size={13} /> Random
              </button>
            </div>
          </div>
          <div className="data-grid">
            <div>
              <div className="panel-title mono" style={{ padding: '10px 14px 0', textTransform: 'none', letterSpacing: 0 }}>{FILE}</div>
              <textarea
                className="file-edit"
                spellCheck={false}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setPreset(null);
                }}
                aria-label="Contents of prices.txt"
              />
              <div className="cmdline">
                <span style={{ color: 'var(--muted)' }}>$ ./stocks</span>
                <input value={arg} onChange={(e) => setArg(e.target.value)} aria-label="Command line argument" spellCheck={false} />
              </div>
            </div>
            <div className="panel-body">
              <div className="viz-title">
                <span>{toks.length} prices</span>
                <span style={{ color: v.sell ? 'var(--red)' : 'var(--green)' }}>
                  {v.sell ? `should print SELL! after reading ${v.value}, price ${v.at + 1}` : 'should print Do NOT Sell!'}
                </span>
              </div>
              <svg viewBox={`0 0 ${Math.max(1, toks.length) * 30} 110`} width="100%" height="120" preserveAspectRatio="none" style={{ display: 'block' }}>
                {toks.map((t, i) => {
                  const h = (t.v / max) * 90;
                  const down = i > 0 && t.v < toks[i - 1].v;
                  const after = v.sell && i > v.at;
                  return (
                    <rect
                      key={i}
                      x={i * 30 + 5}
                      y={100 - h}
                      width={20}
                      height={Math.max(1, h)}
                      rx={2}
                      fill={after ? 'var(--line-2)' : down ? 'var(--red)' : 'var(--blue)'}
                      opacity={i === v.at ? 1 : 0.8}
                    />
                  );
                })}
              </svg>
              <div className="legend" style={{ marginTop: 10 }}>
                <span><i style={{ background: 'var(--blue)' }} />rose or flat</span>
                <span><i style={{ background: 'var(--red)' }} />declined</span>
                <span><i style={{ background: 'var(--line-2)' }} />never read</span>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Your code" icon={<Code2 size={14} />}>
        <Runner
          code={r.code}
          onChange={r.setCode}
          onRun={() => r.run()}
          onReset={() => {
            r.setCode(Q4_STARTER);
            r.run(Q4_STARTER);
          }}
          result={r.ran.result}
          dirty={r.dirty}
          command={command}
          title="stocks.c"
        />
        <div style={{ marginTop: 24 }}>
          <TestsPanel results={results} onRun={runChecks} points={20} dirty={testedSrc !== null && testedSrc !== r.code} />
        </div>
      </Section>

      <Section
        title="Debugger"
        icon={<Bug size={14} />}
        right={
          <div className="seg">
            <button className={which === 'mine' ? 'on' : ''} onClick={() => setWhich('mine')}>Your code</button>
            <button className={which === 'solution' ? 'on' : ''} onClick={() => setWhich('solution')}>Solution</button>
          </div>
        }
      >
        {which === 'solution' && !revealed ? (
          <Gate open={false} onOpen={() => update('revealed', 4, true)} label="This traces the reference solution. Try it yourself first.">
            {null}
          </Gate>
        ) : (
          <>
            <div className="prose" style={{ marginBottom: 16 }}>
              <p>
                {showSolution ? 'Tracing the reference solution' : 'Tracing the code you last ran'} on the data above. The file view
                highlights the number <code>fscanf</code> just consumed, and the chart colors each day by whether it fell. Change the
                data and the trace updates.
              </p>
            </div>
            <Debugger
              source={showSolution ? Q4_SOLUTION : r.ran.src}
              result={showSolution ? solution : r.ran.result}
              notes={Q4_NOTES}
              command={command}
              visualLabel="Prices"
              visual={(view, { prev, result }) => <StocksViz view={view} prev={prev} text={text} output={result.output} />}
            />
          </>
        )}
      </Section>

      <Section title="Solution" icon={<KeyRound size={14} />}>
        <Gate open={revealed} onOpen={() => update('revealed', 4, true)} label="The reference loop body and why it works.">
          <div className="grid-2">
            <div>
              <CodeBlock
                numbers={false}
                code={`if (current < previous)
{
    declining++;
    if (declining == 2)
    {
        printf("SELL!\\n");
        fclose(file);
        return 0;
    }
}
else
{
    declining = 0;
}
previous = current;`}
              />
            </div>
            <div className="prose">
              <p>
                <strong>Compare, then slide.</strong> Each pass compares today with yesterday, then copies <code>current</code> into{' '}
                <code>previous</code> so the next pass compares the next pair.
              </p>
              <p>
                <strong>Count the streak.</strong> A strict decline adds one to <code>declining</code>. Anything else, including an
                unchanged price, resets it to zero. Forgetting the reset is the most common mistake: then any two declines anywhere in the
                file would trigger the sale.
              </p>
              <p>
                <strong>Halt right away.</strong> Once the streak reaches two, print, close the file and return. Using{' '}
                <code>break</code> instead would fall through to <code>Do NOT Sell!</code> as well.
              </p>
              <button
                className="btn"
                onClick={() => {
                  r.setCode(Q4_SOLUTION);
                  r.run(Q4_SOLUTION);
                }}
              >
                <ClipboardPaste size={15} /> Load into the editor
              </button>
            </div>
          </div>
        </Gate>
      </Section>
    </>
  );
}

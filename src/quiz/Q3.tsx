import { useMemo, useState } from 'react';
import { Bug, ClipboardPaste, Code2, KeyRound } from 'lucide-react';
import { run } from '../c/interp';
import { CodeBlock } from '../ui/highlight';
import { Debugger } from '../ui/Debugger';
import { StackViz } from '../viz/StackViz';
import { Gate, Runner, Section, useRunner } from './parts';
import { Q3_NOTES } from './notes';
import { Q3_SOLUTION, Q3_STARTER, Q3_TESTS, withMain } from './programs';
import { TestResult, TestsPanel } from './Tests';
import { QuestionProps } from './types';

function check(code: string): TestResult[] {
  return Q3_TESTS.map((t) => {
    const r = run(t.main ? withMain(code, t.main) : code, { record: false, maxSteps: 100000 });
    const got = r.error?.kind === 'compile' ? `a compile error${r.error.line ? ` on line ${r.error.line}` : ''}: ${r.error.message}` : r.error ? `${r.output}${r.error.message}` : r.output;
    return { name: t.name, expected: t.expect, got, pass: !r.error && r.output === t.expect };
  });
}

export function Q3({ p, update }: QuestionProps) {
  const exec = (src: string) => run(src);
  const r = useRunner(Q3_STARTER, exec, p.code[3], (s) => update('code', 3, s));
  const [results, setResults] = useState<TestResult[]>(() => Q3_TESTS.map((t) => ({ name: t.name, expected: t.expect, got: null, pass: null })));
  const [testedSrc, setTestedSrc] = useState<string | null>(null);
  const [which, setWhich] = useState<'mine' | 'solution'>('mine');
  const solution = useMemo(() => run(Q3_SOLUTION), []);
  const revealed = !!p.revealed[3];

  const runChecks = () => {
    const res = check(r.code);
    setResults(res);
    setTestedSrc(r.code);
    update('tests', 3, [res.filter((x) => x.pass).length, res.length]);
    r.run();
  };

  const showSolution = which === 'solution' && revealed;

  return (
    <>
      <div className="prose">
        <p>
          Below is a partial implementation of a stack that stores individual characters. When complete, the program should print
          the following on a single line:
        </p>
      </div>
      <div style={{ maxWidth: 520 }}>
        <CodeBlock code="C B A" numbers={false} />
      </div>
      <div className="prose">
        <p>
          The program is missing code in <strong>three places</strong>: the body of <code>push</code>, the condition in{' '}
          <code>pop</code>, and the body of <code>pop</code>. Fill them in directly in the editor, then run it. The checks also try your{' '}
          <code>push</code> and <code>pop</code> with a few other <code>main</code> functions.
        </p>
      </div>

      <Section title="Your code" icon={<Code2 size={14} />}>
        <Runner
          code={r.code}
          onChange={r.setCode}
          onRun={() => r.run()}
          onReset={() => {
            r.setCode(Q3_STARTER);
            r.run(Q3_STARTER);
          }}
          result={r.ran.result}
          dirty={r.dirty}
          command="./stack"
          title="stack.c"
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
          <Gate open={false} onOpen={() => update('revealed', 3, true)} label="This traces the reference solution. Try it yourself first.">
            {null}
          </Gate>
        ) : (
          <>
            <div className="prose" style={{ marginBottom: 16 }}>
              <p>
                {showSolution ? 'Tracing the reference solution.' : 'Tracing the code you last ran.'} The stack view draws{' '}
                <code>s.items</code> bottom up with an arrow at <code>top</code>. Slots above <code>top</code> that still hold a
                character were popped: the value is still in memory, it just no longer counts.
              </p>
            </div>
            <Debugger
              source={showSolution ? Q3_SOLUTION : r.ran.src}
              result={showSolution ? solution : r.ran.result}
              notes={Q3_NOTES}
              command="./stack"
              visualLabel="Stack"
              visual={(view, { prev }) => <StackViz view={view} prev={prev} />}
            />
          </>
        )}
      </Section>

      <Section title="Solution" icon={<KeyRound size={14} />}>
        <Gate open={revealed} onOpen={() => update('revealed', 3, true)} label="The reference solution and why it works.">
          <div className="grid-2">
            <div>
              <div className="viz-title"><span>In <b>push</b>, after the overflow check</span></div>
              <CodeBlock numbers={false} code={'s->top++;\ns->items[s->top] = ch;'} />
              <div className="viz-title"><span>The condition in <b>pop</b></span></div>
              <CodeBlock numbers={false} code={'if (s->top == -1)'} />
              <div className="viz-title"><span>The body of <b>pop</b>, after the underflow check</span></div>
              <CodeBlock numbers={false} code={'return s->items[s->top--];'} />
            </div>
            <div className="prose">
              <p>
                <strong>The invariant.</strong> <code>top</code> is always the index of the highest filled slot, so an empty stack has{' '}
                <code>top</code> equal to <code>-1</code> and a full one has it at <code>MAX_STACK - 1</code>.
              </p>
              <p>
                <strong>push</strong> moves <code>top</code> up one, then writes into that slot. The one line version{' '}
                <code>s-&gt;items[++s-&gt;top] = ch;</code> does the same thing because prefix <code>++</code> increments before the
                index is used.
              </p>
              <p>
                <strong>pop</strong> reads the slot at <code>top</code>, then moves <code>top</code> down. Postfix <code>--</code> uses the
                old value first. A longer version that earns the same credit:{' '}
                <code>char c = s-&gt;items[s-&gt;top]; s-&gt;top--; return c;</code>
              </p>
              <p>
                For the empty check, <code>s-&gt;top &lt; 0</code> works just as well as <code>s-&gt;top == -1</code>.
              </p>
              <button
                className="btn"
                onClick={() => {
                  r.setCode(Q3_SOLUTION);
                  r.run(Q3_SOLUTION);
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

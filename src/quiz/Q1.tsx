import { Bug, Play } from 'lucide-react';
import { run } from '../c/interp';
import { CodeBlock } from '../ui/highlight';
import { Debugger } from '../ui/Debugger';
import { PointerViz } from '../viz/PointerViz';
import { Choices, Gate, Runner, Section, useRunner } from './parts';
import { Q1_NOTES } from './notes';
import { Q1_PROGRAM, Q1_SNIPPET } from './programs';
import { QuestionProps } from './types';

const CHOICES = [
  { key: 'A', body: '16', why: <>16 would need <code>x</code> and <code>y</code> to both end up as 8. Pointing <code>p</code> at <code>y</code> does not drag <code>x</code> along, so the second write only touches <code>y</code>.</> },
  { key: 'B', body: '18', why: <><code>*p = 10</code> writes into <code>x</code>. Then <code>p = &amp;y</code> aims the pointer at <code>y</code>, so <code>*p = 8</code> writes into <code>y</code>. 10 plus 8 is 18.</> },
  { key: 'C', body: '20', why: <>20 would need both writes to land in the same variable and the other to also be 10. Each write lands only in the variable <code>p</code> points at in that moment.</> },
  { key: 'D', body: '0x124', why: <><code>%d</code> prints a plain decimal integer. It never prints an address or a hex value, so <code>0x124</code> cannot appear.</> },
  { key: 'E', body: 'None of the above', why: <>One of the listed values is correct: 18.</> },
];

export function Q1({ p, update }: QuestionProps) {
  const r = useRunner(Q1_PROGRAM, (src) => run(src), p.code[1], (s) => update('code', 1, s));
  const open = !!p.checked[1] || !!p.revealed[1];
  return (
    <>
      <div className="prose">
        <p>What does the following C code print?</p>
      </div>
      <div style={{ maxWidth: 520 }}>
        <CodeBlock code={Q1_SNIPPET} numbers={false} />
      </div>
      <Choices
        choices={CHOICES}
        answer="B"
        selected={p.choice[1]}
        checked={p.checked[1]}
        onSelect={(k) => update('choice', 1, k)}
        onCheck={() => update('checked', 1, true)}
        onRetry={() => {
          update('checked', 1, false);
          update('choice', 1, undefined);
        }}
      />

      <Section title="Debugger" icon={<Bug size={14} />}>
        <Gate open={open} onOpen={() => update('revealed', 1, true)} label="The walkthrough gives the answer away. Check your answer first.">
          <div className="prose" style={{ marginBottom: 16 }}>
            <p>
              Step through one line at a time. The memory view shows each variable at its address on the stack, and the
              blue arrow shows where <code>p</code> points. Use the arrow keys to move between steps.
            </p>
          </div>
          <Debugger
            source={r.ran.src}
            result={r.ran.result}
            notes={Q1_NOTES}
            command="./pointers"
            visualLabel="Memory"
            visual={(view, { prev }) => <PointerViz view={view} prev={prev} />}
          />
        </Gate>
      </Section>

      <Section title="Run it yourself" icon={<Play size={14} />}>
        <div className="prose" style={{ marginBottom: 16 }}>
          <p>The snippet inside a complete program. Edit anything and run it again; the debugger above follows whatever you last ran.</p>
        </div>
        <Runner
          code={r.code}
          onChange={r.setCode}
          onRun={() => r.run()}
          onReset={() => {
            r.setCode(Q1_PROGRAM);
            r.run(Q1_PROGRAM);
          }}
          result={r.ran.result}
          dirty={r.dirty}
          command="./pointers"
          title="pointers.c"
        />
      </Section>
    </>
  );
}

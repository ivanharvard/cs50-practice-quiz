import { Bug, Play } from 'lucide-react';
import { run } from '../c/interp';
import { CodeBlock } from '../ui/highlight';
import { Debugger } from '../ui/Debugger';
import { ListDiagram, ListModel, ListViz } from '../viz/ListViz';
import { Choices, Gate, Runner, Section, useRunner } from './parts';
import { Q2_NOTES } from './notes';
import { Q2_PROGRAM, Q2_SNIPPET, Q2_STRUCT } from './programs';
import { QuestionProps } from './types';

function chain(values: number[]): ListModel {
  return {
    nodes: values.map((v, i) => ({ id: i, value: String(v), next: i < values.length - 1 ? i + 1 : null })),
    labels: [{ name: 'head', target: 0 }],
  };
}

const CHOICES = [
  {
    key: 'a',
    body: <ListDiagram compact model={chain([20, 10, 30, 40])} />,
    why: <><code>p</code> grabs 20. Then 10 is pointed past 20 at 30, 20 is pointed at 10, and <code>head</code> moves to 20. The first two nodes have swapped places.</>,
  },
  {
    key: 'b',
    body: <ListDiagram compact model={chain([10, 30, 40, 20])} />,
    why: <>This would mean 20 moved to the end. Nothing in the code touches the <code>next</code> pointer of 40, so 40 still ends the list.</>,
  },
  {
    key: 'c',
    body: <ListDiagram compact model={chain([10, 20, 40, 30])} />,
    why: <>The four lines only touch the first two nodes and <code>head</code>. The nodes holding 30 and 40 are never written to.</>,
  },
  {
    key: 'd',
    body: <ListDiagram compact model={chain([10, 20, 30, 40])} />,
    why: <>Assigning through <code>head-&gt;next</code> and <code>p-&gt;next</code> changes the nodes themselves, not copies, so the list really does change.</>,
  },
  { key: 'e', body: 'None of the above', why: <>Choice (a) matches exactly.</> },
];

export function Q2({ p, update }: QuestionProps) {
  const r = useRunner(Q2_PROGRAM, (src) => run(src), p.code[2], (s) => update('code', 2, s));
  const open = !!p.checked[2] || !!p.revealed[2];
  return (
    <>
      <div className="prose">
        <p>Consider the following structure that implements a singly linked list containing integers:</p>
      </div>
      <div style={{ maxWidth: 520 }}>
        <CodeBlock code={Q2_STRUCT} numbers={false} />
      </div>
      <div className="prose">
        <p>Suppose we have created the following list using this struct, and that the variable <code>head</code> points to the first node:</p>
      </div>
      <div className="panel" style={{ padding: '14px 18px', maxWidth: 620, marginBottom: 18 }}>
        <ListDiagram model={chain([10, 20, 30, 40])} />
      </div>
      <div className="prose">
        <p>What does this list look like after executing the following code?</p>
      </div>
      <div style={{ maxWidth: 520 }}>
        <CodeBlock code={Q2_SNIPPET} numbers={false} />
      </div>
      <div className="callout">
        <b>Heads up:</b> the quiz writes <code className="inline-code">Node</code> but the typedef is <code className="inline-code">node</code>. C is case
        sensitive, so that line would not compile as printed. Treat it as <code className="inline-code">node</code>. You can see the compiler
        complain by changing it in the program below.
      </div>
      <Choices
        choices={CHOICES}
        answer="a"
        selected={p.choice[2]}
        checked={p.checked[2]}
        onSelect={(k) => update('choice', 2, k)}
        onCheck={() => update('checked', 2, true)}
        onRetry={() => {
          update('checked', 2, false);
          update('choice', 2, undefined);
        }}
      />

      <Section title="Debugger" icon={<Bug size={14} />}>
        <Gate open={open} onOpen={() => update('revealed', 2, true)} label="The walkthrough gives the answer away. Check your answer first.">
          <div className="prose" style={{ marginBottom: 16 }}>
            <p>
              The debugger starts on the first line of the question. Step back to watch the simulated list get built, or
              forward to watch each pointer get rewired. Nodes stay where they were allocated, so only the arrows move.
            </p>
          </div>
          <Debugger
            source={r.ran.src}
            result={r.ran.result}
            notes={Q2_NOTES}
            startLine="node *p = head->next;"
            command="./list"
            visualLabel="Heap"
            visual={(view, { prev }) => <ListViz view={view} prev={prev} />}
          />
        </Gate>
      </Section>

      <Section title="Run it yourself" icon={<Play size={14} />}>
        <div className="prose" style={{ marginBottom: 16 }}>
          <p>The four lines inside a complete program that builds the list first, then prints it. Try different values or a different rewiring.</p>
        </div>
        <Runner
          code={r.code}
          onChange={r.setCode}
          onRun={() => r.run()}
          onReset={() => {
            r.setCode(Q2_PROGRAM);
            r.run(Q2_PROGRAM);
          }}
          result={r.ran.result}
          dirty={r.dirty}
          command="./list"
          title="list.c"
        />
      </Section>
    </>
  );
}

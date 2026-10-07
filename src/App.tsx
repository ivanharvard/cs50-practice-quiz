import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';
import { ReactNode } from 'react';
import { useHashRoute, useProgress, Progress } from './quiz/store';
import { Q1 } from './quiz/Q1';
import { Q2 } from './quiz/Q2';
import { Q3 } from './quiz/Q3';
import { Q4 } from './quiz/Q4';
import { QuestionProps } from './quiz/types';

interface Q {
  n: number;
  title: string;
  short: string;
  points: number;
  kind: 'choice' | 'code';
  answer?: string;
  Page: (p: QuestionProps) => ReactNode;
}

const QUESTIONS: Q[] = [
  { n: 1, title: 'Two writes through one pointer', short: 'Pointers', points: 5, kind: 'choice', answer: 'B', Page: Q1 },
  { n: 2, title: 'Rewiring a linked list', short: 'Linked lists', points: 5, kind: 'choice', answer: 'a', Page: Q2 },
  { n: 3, title: 'Finish the character stack', short: 'Stacks', points: 20, kind: 'code', Page: Q3 },
  { n: 4, title: 'A sell signal from a price file', short: 'File input', points: 20, kind: 'code', Page: Q4 },
];

function earned(q: Q, p: Progress): number | null {
  if (q.kind === 'choice') return p.checked[q.n] ? (p.choice[q.n] === q.answer ? q.points : 0) : null;
  const t = p.tests[q.n];
  return t ? Math.round((q.points * t[0]) / t[1]) : null;
}

export default function App() {
  const [n, go] = useHashRoute();
  const { p, update, reset } = useProgress();
  const q = QUESTIONS[n - 1];
  const total = QUESTIONS.reduce((s, x) => s + (earned(x, p) ?? 0), 0);
  const Page = q.Page;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="course">CS50 · Fall 2026</div>
          <h1>Practice Quiz 2</h1>
        </div>
        <nav className="nav">
          {QUESTIONS.map((x) => {
            const e = earned(x, p);
            const state = e === null ? '' : e === x.points ? 'correct' : 'wrong';
            return (
              <button key={x.n} className={x.n === n ? 'active' : ''} onClick={() => go(x.n)}>
                <span className={'num ' + state}>{x.n}</span>
                <span className="label">{x.short}</span>
                <span className="pts">{e === null ? x.points : `${e}/${x.points}`}</span>
              </button>
            );
          })}
        </nav>
        <div className="score">
          <div className="row">
            <div className="big">
              {total}
              <span> / 50</span>
            </div>
            <button className="icon-btn" title="Clear all progress" onClick={() => confirm('Clear all answers and code?') && (reset(), location.reload())}>
              <RotateCcw size={15} />
            </button>
          </div>
          <small>points so far</small>
          <div className="meter">
            {QUESTIONS.map((x) => {
              const e = earned(x, p);
              return Array.from({ length: x.points / 5 }, (_, k) => <i key={x.n + ':' + k} className={e !== null && e >= (k + 1) * 5 ? 'on' : ''} />);
            })}
          </div>
          <small style={{ display: 'block', marginTop: 14, color: 'var(--faint)' }}>All code compiles and runs in your browser.</small>
        </div>
      </aside>

      <main className="main">
        <div className="mobile-nav">
          {QUESTIONS.map((x) => (
            <button key={x.n} className={x.n === n ? 'on' : ''} onClick={() => go(x.n)}>
              {x.n}. {x.short}
            </button>
          ))}
        </div>
        <div className="page" key={n}>
          <div className="eyebrow">
            <span>Question {q.n} of 4</span>
            <span className="chip">{q.points} points</span>
            <span className="chip">{q.kind === 'choice' ? 'multiple choice' : 'write code'}</span>
          </div>
          <h1 className="title">{q.title}</h1>
          <Page p={p} update={update} />
          <div className="pager">
            {n > 1 ? (
              <button className="btn ghost" onClick={() => go(n - 1)}>
                <ArrowLeft size={16} /> {QUESTIONS[n - 2].short}
              </button>
            ) : <span />}
            {n < 4 ? (
              <button className="btn" onClick={() => go(n + 1)}>
                {QUESTIONS[n].short} <ArrowRight size={16} />
              </button>
            ) : <span />}
          </div>
        </div>
      </main>
    </div>
  );
}

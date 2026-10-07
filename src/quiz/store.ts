import { useEffect, useState } from 'react';

export interface Progress {
  choice: Record<number, string | undefined>;
  checked: Record<number, boolean | undefined>;
  code: Record<number, string | undefined>;
  tests: Record<number, [number, number] | undefined>;
  revealed: Record<number, boolean | undefined>;
}

const KEY = 'practice-quiz-2:v1';
const EMPTY: Progress = { choice: {}, checked: {}, code: {}, tests: {}, revealed: {} };

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return EMPTY;
}

export function useProgress() {
  const [p, setP] = useState<Progress>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* storage unavailable */
    }
  }, [p]);
  const update = <K extends keyof Progress>(k: K, id: number, v: Progress[K][number]) =>
    setP((cur) => ({ ...cur, [k]: { ...cur[k], [id]: v } }));
  const reset = () => setP(EMPTY);
  return { p, update, reset };
}

export function useHashRoute(): [number, (n: number) => void] {
  const parse = () => {
    const m = location.hash.match(/(\d)/);
    const n = m ? Number(m[1]) : 1;
    return n >= 1 && n <= 4 ? n : 1;
  };
  const [n, setN] = useState(parse);
  useEffect(() => {
    const on = () => setN(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [
    n,
    (x: number) => {
      location.hash = `#/question/${x}`;
      window.scrollTo({ top: 0 });
    },
  ];
}

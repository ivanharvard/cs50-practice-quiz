import { Progress } from './store';

export interface QuestionProps {
  p: Progress;
  update: <K extends keyof Progress>(k: K, id: number, v: Progress[K][number]) => void;
}

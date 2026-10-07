import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../interp';

const prog = (n: string) => readFileSync(join(__dirname, 'progs', n), 'utf8');
const prices = readFileSync(join(__dirname, 'progs', 'prices.txt'), 'utf8');
const prices2 = readFileSync(join(__dirname, 'progs', 'prices2.txt'), 'utf8');

describe('interpreter matches gcc', () => {
  it('q1', () => expect(run(prog('q1.c')).output).toBe('18'));
  it('q2', () => expect(run(prog('q2.c')).output).toBe('20 10 30 40 \n'));
  it('q3', () => expect(run(prog('q3.c')).output).toBe('C B A\n'));
  it('q4', () => {
    const files = { 'prices.txt': prices };
    expect(run(prog('q4.c'), { args: ['stocks', 'prices.txt'], files }).output).toBe('SELL!\n');
    expect(run(prog('q4.c'), { args: ['stocks', 'prices.txt'], files: { 'prices.txt': prices2 } }).output).toBe('Do NOT Sell!\n');
    const r = run(prog('q4.c'), { args: ['stocks', 'nope.txt'], files });
    expect(r.output).toBe('Could not open file nope.txt\n');
    expect(r.exitCode).toBe(1);
  });
  it('misc', () => {
    const r = run(prog('misc.c'));
    expect(r.error).toBeNull();
    expect(r.output).toBe(
      'sum=14 fact=3628800\nhello 5 e\n7 z 5.00 8 sizes 16 20\n4 1 2\n4000000000 -3 -1\ntwelve\n[abcde|42  |007]\n66\n',
    );
    expect(r.exitCode).toBe(3);
  });
});

describe('errors', () => {
  it('Node typo is a compile error', () => {
    const src = prog('q2.c').replace('node *p = head->next;', 'Node *p = head->next;');
    const r = run(src);
    expect(r.error?.kind).toBe('compile');
    expect(r.error?.message).toContain("'Node'");
  });
  it('missing semicolon', () => {
    const r = run('int main(void)\n{\n  int x = 1\n  return x;\n}\n');
    expect(r.error?.message).toContain("expected ';'");
    expect(r.error?.line).toBe(3);
  });
  it('null deref segfaults', () => {
    const r = run('#include <stdio.h>\nint main(void)\n{\n  int *p = NULL;\n  *p = 3;\n}\n');
    expect(r.error?.message).toContain('Segmentation fault');
    expect(r.error?.line).toBe(5);
  });
  it('infinite loop stops', () => {
    const r = run('int main(void)\n{\n  while (1) {}\n}\n', { maxSteps: 5000 });
    expect(r.error?.message).toContain('too long');
  });
  it('scanf without & is caught', () => {
    const r = run('#include <stdio.h>\nint main(int argc, char *argv[])\n{\n  FILE *f = fopen("a", "r");\n  int x = 0;\n  fscanf(f, "%d", x);\n}\n', { files: { a: '4' } });
    expect(r.error?.message).toContain('forget the &');
  });
});

describe('trace', () => {
  it('records steps for q1', () => {
    const r = run(prog('q1.c'));
    expect(r.steps.map((s) => s.line)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, null]);
  });
});

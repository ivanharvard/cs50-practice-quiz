# Practice Quiz 2

An interactive walkthrough of CS50 Practice Quiz 2. Every question has its answer choices or a code editor, a step debugger that explains each line, and a visual view of memory. All C code compiles and runs in the browser, so the site is fully static.

## What is inside

**Question 1, pointers.** Memory view of the stack frame with arrows showing where `p` points.

**Question 2, linked lists.** A simulated list is built on the heap, then the four lines from the quiz rewire it while the diagram follows every `next` pointer.

**Question 3, stacks.** Fill in `push` and `pop`, run them, and run checks that swap in other `main` functions. The stack view shows `top` and the stale slots left behind by pops.

**Question 4, file input.** Edit `prices.txt`, pick a preset or random data, change the command line argument, and watch `fscanf` walk through the file.

## How the C runs

`src/c` holds a small C interpreter written in TypeScript: a preprocessor, a parser, and a tree walking evaluator over byte addressable memory with separate stack, heap and data regions. It supports structs, pointers and pointer arithmetic, arrays, `malloc` and `free`, `printf`, `fopen`, `fscanf` and friends over a virtual file system, and it reports compile errors, segmentation faults and runaway loops. Every statement records a snapshot, which is what the debugger steps through.

The tests in `src/c/__tests__` compare its output with gcc on the quiz programs.

## Develop

```
npm install
npm run dev
npm test
npm run build
```

## Deploy

Import the repository in Vercel. It detects Vite; the build command is `npm run build` and the output directory is `dist`. Routing uses the URL hash, so no rewrites are needed.

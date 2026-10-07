import { Notes } from '../ui/Debugger';

export const Q1_NOTES: Notes = {
  'int x = 5;': <>Reserve four bytes on the stack for <code>x</code> and store 5 there.</>,
  'int y = 2;': <><code>y</code> gets its own four bytes right next to <code>x</code>.</>,
  'int *p = &x;': <><code>&amp;x</code> is the address of <code>x</code>. Storing that address in <code>p</code> makes <code>p</code> point at <code>x</code>.</>,
  '*p = 10;': <>The star follows the pointer. This writes 10 into whatever <code>p</code> points at, which is <code>x</code>. The pointer itself does not change.</>,
  'p = &y;': <>No star this time, so this changes <code>p</code> itself. It now holds the address of <code>y</code>. <code>x</code> keeps the 10 it already has.</>,
  '*p = 8;': <>Follow <code>p</code> again. It points at <code>y</code> now, so <code>y</code> becomes 8.</>,
  'printf("%d", x + y);': <><code>x</code> is 10 and <code>y</code> is 8, so this prints <code>18</code>. That is answer B.</>,
};

export const Q2_NOTES: Notes = {
  'node *head = NULL;': <>Setup, not part of the question. We build the list from the diagram so there is something real to rewire.</>,
  'node *tail = NULL;': <><code>tail</code> remembers the last node so new nodes can be appended in order.</>,
  'for (int i = 1; i <= 4; i++)': <>Four passes, one node per pass, holding 10, 20, 30 and 40.</>,
  'node *n = malloc(sizeof(node));': <><code>malloc</code> carves out a fresh node on the heap. Its fields hold leftover garbage until we set them.</>,
  'n->data = i * 10;': <>Store this node&apos;s value.</>,
  'n->next = NULL;': <>A new node is the last one for now, so its <code>next</code> is <code>NULL</code>, drawn as a slash.</>,
  'tail->next = n;': <>Link the old last node to the new one.</>,
  'tail = n;': <>The new node becomes the tail.</>,
  'node *p = head->next;': <>Question line 1. <code>p</code> grabs the second node, 20. Nothing in the list moves yet. The quiz writes <code>Node</code> with a capital N, which would not compile because C is case sensitive, so we use <code>node</code>.</>,
  'head->next = p->next;': <>Question line 2. Node 10 skips over 20 and points straight at 30. Node 20 is now out of the chain, and only <code>p</code> still knows where it is.</>,
  'p->next = head;': <>Question line 3. Node 20 now points at node 10, putting it in front of 10.</>,
  'head = p;': <>Question line 4. <code>head</code> moves to node 20, the new first node. Reading from <code>head</code> now gives 20, 10, 30, 40, which is choice (a).</>,
  'for (node *q = head; q != NULL; q = q->next)': <>Walk the list from <code>head</code> to prove the new order.</>,
  'printf("%d ", q->data);': <>Print the node <code>q</code> is on.</>,
};

export const Q3_NOTES: Notes = {
  'Stack s;': <><code>s</code> lives in <code>main</code>&apos;s stack frame. Its 100 slots and <code>top</code> are leftover garbage until <code>initialize</code> runs.</>,
  'initialize(&s);': <>Pass the address of <code>s</code> so <code>initialize</code> changes the real struct, not a copy.</>,
  's->top = -1;': <><code>top</code> is the index of the highest filled slot. Starting at <code>-1</code> means no slot is filled yet.</>,
  "push(&s, 'A');": <>Push <code>'A'</code>. Watch <code>top</code> move up by one and the slot fill in.</>,
  "push(&s, 'B');": <>Push <code>'B'</code> on top of <code>'A'</code>.</>,
  "push(&s, 'C');": <>Push <code>'C'</code>. It is now on top, so it will be the first to come off.</>,
  'if (s->top == MAX_STACK - 1)': <>Full check. The last valid index is 99, so a full stack has <code>top</code> equal to 99.</>,
  's->top++;': <>Missing code, part one. Move <code>top</code> up to the next free slot first.</>,
  's->items[s->top] = ch;': <>Then store the character in that slot. Doing these in the other order would overwrite the current top item.</>,
  'if (s->top == -1)': <>Missing code, part two. An empty stack has <code>top</code> at <code>-1</code>, so there is nothing to pop.</>,
  'return s->items[s->top--];': <>Missing code, part three. The postfix <code>--</code> runs after the value is read, so this returns the top character and shrinks the stack in one line. The character stays in memory; it just stops counting as part of the stack.</>,
  'printf("%c ", pop(&s));': <><code>pop</code> runs first, then <code>printf</code> prints the character it returned.</>,
  'printf("%c\\n", pop(&s));': <>Last pop. The stack is empty again, and the output reads <code>C B A</code>: last in, first out.</>,
  'return 0;': <>Exit status 0 tells the shell that everything went fine.</>,
};

export const Q4_NOTES: Notes = {
  'int declining = 0;   // # consecutive days of decline': <>The streak counter. It starts at zero because nothing has been compared yet.</>,
  'file = fopen(argv[1], "r");': <><code>argv[1]</code> is the first command line argument, the file name. <code>fopen</code> returns <code>NULL</code> if it cannot open that file.</>,
  'if (file == NULL)': <>Always check <code>fopen</code> before reading. Try typing a file name that does not exist in the command box to watch this branch run.</>,
  'fscanf(file, "%d", &previous);': <>Read the first price into <code>previous</code>. <code>%d</code> skips any spaces and newlines before the number, so the uneven layout of the file does not matter.</>,
  'while (fscanf(file, "%d", &current) == 1)': <><code>fscanf</code> returns how many values it filled in. A 1 means a new price landed in <code>current</code>. At the end of the file it returns <code>EOF</code> and the loop stops.</>,
  'if (current < previous)': <>A decline means strictly lower. An equal price fails this test.</>,
  'declining++;': <>One more day of decline in a row.</>,
  'if (declining == 2)': <>Two declines in a row is the sell signal.</>,
  'printf("SELL!\\n");': <>Print the signal. The program then closes the file and returns right away, so the remaining prices are never read.</>,
  'fclose(file);': <>Release the file before leaving.</>,
  'declining = 0;': <>The price rose or stayed flat, so the streak is broken. Without this reset, two declines separated by a flat day would wrongly trigger <code>SELL!</code>. Load the preset named Flat day breaks a streak to see it.</>,
  'previous = current;': <>Slide forward one day: today&apos;s price becomes yesterday&apos;s for the next comparison.</>,
  'printf("Do NOT Sell!\\n");': <>Reached only when the loop runs out of prices without ever seeing two declines in a row.</>,
};

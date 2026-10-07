export const Q1_SNIPPET = `int x = 5;
int y = 2;
int *p = &x;
*p = 10;
p = &y;
*p = 8;
printf("%d", x + y);`;

export const Q1_PROGRAM = `#include <stdio.h>

int main(void)
{
    int x = 5;
    int y = 2;
    int *p = &x;
    *p = 10;
    p = &y;
    *p = 8;
    printf("%d", x + y);
}
`;

export const Q2_STRUCT = `typedef struct node {
    int data;
    struct node *next;
} node;`;

export const Q2_SNIPPET = `Node *p = head->next;
head->next = p->next;
p->next = head;
head = p;`;

export const Q2_PROGRAM = `#include <stdio.h>
#include <stdlib.h>

typedef struct node {
    int data;
    struct node *next;
} node;

int main(void)
{
    // Simulated data: build the list 10, 20, 30, 40
    node *head = NULL;
    node *tail = NULL;
    for (int i = 1; i <= 4; i++)
    {
        node *n = malloc(sizeof(node));
        n->data = i * 10;
        n->next = NULL;
        if (head == NULL)
        {
            head = n;
        }
        else
        {
            tail->next = n;
        }
        tail = n;
    }

    // The four lines from the question
    node *p = head->next;
    head->next = p->next;
    p->next = head;
    head = p;

    // Print the list by following next pointers
    for (node *q = head; q != NULL; q = q->next)
    {
        printf("%d ", q->data);
    }
    printf("\\n");
}
`;

const Q3_HEAD = `#include <stdio.h>

#define MAX_STACK 100   // largest number of Stack elements

typedef struct {
    char items[MAX_STACK];
    int top;   // where the "top" of the stack is located
} Stack;

/* Initialize an empty stack */
void initialize(Stack *s)
{
    s->top = -1;
}
`;

export const Q3_MAIN = `int main(void)
{
    Stack s;

    initialize(&s);

    push(&s, 'A');
    push(&s, 'B');
    push(&s, 'C');

    printf("%c ", pop(&s));
    printf("%c ", pop(&s));
    printf("%c\\n", pop(&s));

    return 0;
}
`;

export const Q3_STARTER = `${Q3_HEAD}
/* Push a character onto the stack */
void push(Stack *s, char ch)
{
    if (s->top == MAX_STACK - 1)
    {
        printf("Stack overflow!\\n");
        return;
    }

    // missing code goes here
}

/* Pop a character from the stack */
char pop(Stack *s)
{
    if ( /* missing code goes here */ )
    {
        printf("Stack underflow!\\n");
        return '\\0';
    }

    // missing code goes here
}

${Q3_MAIN}`;

export const Q3_SOLUTION = `${Q3_HEAD}
/* Push a character onto the stack */
void push(Stack *s, char ch)
{
    if (s->top == MAX_STACK - 1)
    {
        printf("Stack overflow!\\n");
        return;
    }

    s->top++;
    s->items[s->top] = ch;
}

/* Pop a character from the stack */
char pop(Stack *s)
{
    if (s->top == -1)
    {
        printf("Stack underflow!\\n");
        return '\\0';
    }

    return s->items[s->top--];
}

${Q3_MAIN}`;

/** Swaps the quiz's main for a different one so the same push and pop can be tested more ways. */
export function withMain(src: string, main: string) {
  const i = src.search(/int\s+main\s*\(/);
  if (i < 0) return src + '\n' + main;
  return src.slice(0, i) + 'int original_main' + src.slice(i + src.slice(i).indexOf('(')) + '\n' + main;
}

export const Q3_TESTS = [
  { name: 'The quiz program', main: null as string | null, expect: 'C B A\n' },
  {
    name: 'Pop from an empty stack',
    main: `int main(void)\n{\n    Stack s;\n    initialize(&s);\n    char c = pop(&s);\n    printf("%d\\n", c);\n}\n`,
    expect: 'Stack underflow!\n0\n',
  },
  {
    name: 'Pushes and pops interleaved',
    main: `int main(void)\n{\n    Stack s;\n    initialize(&s);\n    push(&s, 'A');\n    push(&s, 'B');\n    printf("%c", pop(&s));\n    push(&s, 'C');\n    printf("%c", pop(&s));\n    printf("%c\\n", pop(&s));\n}\n`,
    expect: 'BCA\n',
  },
  {
    name: 'Fill all 100 slots, then one more',
    main: `int main(void)\n{\n    Stack s;\n    initialize(&s);\n    for (int i = 0; i < 101; i++)\n    {\n        push(&s, 'a' + i % 26);\n    }\n    int top = s.top;\n    printf("%d %c\\n", top, pop(&s));\n}\n`,
    expect: 'Stack overflow!\n99 v\n',
  },
];

export const Q4_STARTER_BODY = `            // write the missing code`;

const q4 = (body: string) => `#include <stdio.h>
#include <stdlib.h>

int main(int argc, char *argv[])
{
    FILE *file;
    int previous, current;
    int declining = 0;   // # consecutive days of decline

    file = fopen(argv[1], "r");

    if (file == NULL)
    {
        printf("Could not open file %s\\n", argv[1]);
        return 1;
    }

    /* Read the first price */
    fscanf(file, "%d", &previous);

    /* Read each subsequent price */
    while (fscanf(file, "%d", &current) == 1)
    {
${body}
    }

    printf("Do NOT Sell!\\n");

    fclose(file);
    return 0;
}
`;

export const Q4_STARTER = q4(`
        // write the missing code
`);

export const Q4_SOLUTION = q4(`        if (current < previous)
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
        previous = current;`);

export const Q4_QUIZ_FILE = `   15     20
       13   30
         27   27   26   24   29
   30
`;

export interface PriceSet {
  id: string;
  name: string;
  text: string;
}

export const PRICE_SETS: PriceSet[] = [
  { id: 'quiz', name: 'Quiz example', text: Q4_QUIZ_FILE },
  { id: 'swap', name: '24 becomes 28', text: Q4_QUIZ_FILE.replace('24', '28') },
  { id: 'flat', name: 'Flat day breaks a streak', text: '30 27\n27 26\n28 31\n' },
  { id: 'early', name: 'Falls right away', text: '50\n45\n40\n60\n' },
  { id: 'up', name: 'Only goes up', text: '1 2 3 4 5 6 7 8\n' },
  { id: 'two', name: 'Just two prices', text: '9 4\n' },
];

/** Random walk of prices spread across lines with uneven whitespace, like the quiz file. */
export function randomPrices(seed = Date.now()): string {
  let s = seed % 2147483647;
  const rnd = () => (s = (s * 48271) % 2147483647) / 2147483647;
  const n = 8 + Math.floor(rnd() * 7);
  let p = 20 + Math.floor(rnd() * 30);
  const vals: number[] = [];
  for (let i = 0; i < n; i++) {
    vals.push(p);
    p = Math.max(1, p + Math.floor(rnd() * 15) - 7);
  }
  let out = '';
  let col = 0;
  for (const v of vals) {
    out += ' '.repeat(1 + Math.floor(rnd() * 4)) + v;
    col++;
    if (col >= 2 + Math.floor(rnd() * 4)) {
      out += '\n';
      col = 0;
    }
  }
  return out.endsWith('\n') ? out : out + '\n';
}

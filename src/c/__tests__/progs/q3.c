#include <stdio.h>

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

/* Push a character onto the stack */
void push(Stack *s, char ch)
{
    if (s->top == MAX_STACK - 1)
    {
        printf("Stack overflow!\n");
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
        printf("Stack underflow!\n");
        return '\0';
    }

    return s->items[s->top--];
}

int main(void)
{
    Stack s;

    initialize(&s);

    push(&s, 'A');
    push(&s, 'B');
    push(&s, 'C');

    printf("%c ", pop(&s));
    printf("%c ", pop(&s));
    printf("%c\n", pop(&s));

    return 0;
}

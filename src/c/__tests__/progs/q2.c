#include <stdio.h>
#include <stdlib.h>

typedef struct node {
    int data;
    struct node *next;
} node;

int main(void)
{
    // Simulated setup: build 10 -> 20 -> 30 -> 40
    int values[] = {10, 20, 30, 40};
    node *head = NULL;
    for (int i = 3; i >= 0; i--)
    {
        node *n = malloc(sizeof(node));
        n->data = values[i];
        n->next = head;
        head = n;
    }

    // The code from the question
    node *p = head->next;
    head->next = p->next;
    p->next = head;
    head = p;

    for (node *q = head; q != NULL; q = q->next)
    {
        printf("%d ", q->data);
    }
    printf("\n");
}

#include <stdio.h>
#include <string.h>
#include <stdlib.h>

typedef struct { int a; char b; double c; } thing;

int fact(int n) { return n <= 1 ? 1 : n * fact(n - 1); }

int main(void)
{
    int arr[5] = {3, 1, 4, 1, 5};
    int sum = 0;
    for (int i = 0; i < 5; i++) sum += arr[i];
    printf("sum=%d fact=%d\n", sum, fact(10));
    char s[] = "hello";
    printf("%s %lu %c\n", s, strlen(s), s[1]);
    thing t = {7, 'z', 2.5};
    thing u = t;
    u.a++;
    printf("%d %c %.2f %d sizes %lu %lu\n", t.a, u.b, u.c * 2, u.a, sizeof(thing), sizeof(arr));
    int *q = arr + 2;
    printf("%d %d %ld\n", *q, q[1], q - arr);
    unsigned int big = 4000000000u;
    printf("%u %d %d\n", big, -7 / 2, -7 % 2);
    int x = 0;
    do { x += 3; } while (x < 10);
    switch (x) { case 12: printf("twelve\n"); break; default: printf("other\n"); }
    char *dyn = malloc(6);
    strcpy(dyn, "abc");
    strcat(dyn, "de");
    printf("[%5s|%-4d|%03d]\n", dyn, 42, 7);
    free(dyn);
    printf("%d\n", 'A' + 1);
    return 3;
}

#include <stdio.h>

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

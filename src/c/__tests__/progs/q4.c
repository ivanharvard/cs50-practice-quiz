#include <stdio.h>
#include <stdlib.h>

int main(int argc, char *argv[])
{
    FILE *file;
    int previous, current;
    int declining = 0;   // # consecutive days of decline

    file = fopen(argv[1], "r");

    if (file == NULL)
    {
        printf("Could not open file %s\n", argv[1]);
        return 1;
    }

    /* Read the first price */
    fscanf(file, "%d", &previous);

    /* Read each subsequent price */
    while (fscanf(file, "%d", &current) == 1)
    {
        if (current < previous)
        {
            declining++;
            if (declining == 2)
            {
                printf("SELL!\n");
                fclose(file);
                return 0;
            }
        }
        else
        {
            declining = 0;
        }
        previous = current;
    }

    printf("Do NOT Sell!\n");

    fclose(file);
    return 0;
}

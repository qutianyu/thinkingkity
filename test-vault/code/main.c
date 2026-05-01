/**
 * A sample C program demonstrating pointers, structs, and dynamic memory.
 * Compile: gcc -Wall -o main main.c
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

typedef enum {
    PRIORITY_LOW,
    PRIORITY_MEDIUM,
    PRIORITY_HIGH,
} Priority;

const char *priority_str(Priority p) {
    switch (p) {
        case PRIORITY_HIGH:   return "HIGH";
        case PRIORITY_MEDIUM: return "MEDIUM";
        default:              return "LOW";
    }
}

typedef struct Task {
    char *title;
    Priority priority;
    bool done;
    struct Task *next;
} Task;

Task *task_new(const char *title, Priority priority) {
    Task *t = malloc(sizeof(Task));
    if (!t) return NULL;
    t->title = strdup(title);
    t->priority = priority;
    t->done = false;
    t->next = NULL;
    return t;
}

void task_free(Task *t) {
    if (!t) return;
    free(t->title);
    free(t);
}

void task_print(const Task *t) {
    printf("  [%c] %s (%s)\n",
           t->done ? 'x' : ' ', t->title, priority_str(t->priority));
}

typedef struct {
    Task *head;
    size_t count;
} TaskList;

void tasklist_add(TaskList *list, Task *t) {
    t->next = list->head;
    list->head = t;
    list->count++;
}

void tasklist_print_pending(const TaskList *list) {
    printf("Pending tasks (%zu total):\n", list->count);
    for (Task *cur = list->head; cur; cur = cur->next) {
        if (!cur->done) {
            task_print(cur);
        }
    }
}

void tasklist_free(TaskList *list) {
    Task *cur = list->head;
    while (cur) {
        Task *next = cur->next;
        task_free(cur);
        cur = next;
    }
    list->head = NULL;
    list->count = 0;
}

int main(void) {
    TaskList list = {0};

    tasklist_add(&list, task_new("Fix segmentation fault", PRIORITY_HIGH));
    tasklist_add(&list, task_new("Refactor memory management", PRIORITY_MEDIUM));
    tasklist_add(&list, task_new("Write man page", PRIORITY_LOW));

    tasklist_print_pending(&list);

    // Mark first task as done
    if (list.head) {
        list.head->done = true;
        printf("\nCompleted: %s\n", list.head->title);
    }

    tasklist_free(&list);
    return 0;
}

#!/usr/bin/env python3
"""A sample Python script demonstrating various language features."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class Task:
    title: str
    completed: bool = False
    assignee: Optional[str] = None

    def toggle(self) -> None:
        self.completed = not self.completed

    def __str__(self) -> str:
        status = "✓" if self.completed else "☐"
        return f"[{status}] {self.title}"


class TaskManager:
    def __init__(self) -> None:
        self._tasks: list[Task] = []

    def add(self, title: str, assignee: Optional[str] = None) -> Task:
        task = Task(title=title, assignee=assignee)
        self._tasks.append(task)
        return task

    def list_pending(self) -> list[Task]:
        return [t for t in self._tasks if not t.completed]

    @property
    def count(self) -> int:
        return len(self._tasks)

    @property
    def done_count(self) -> int:
        return sum(1 for t in self._tasks if t.completed)


def main() -> None:
    manager = TaskManager()
    manager.add("Write unit tests")
    manager.add("Refactor module", assignee="Alice")
    manager.add("Deploy to production", assignee="Bob")

    print(f"Total tasks: {manager.count}")
    print(f"Done: {manager.done_count}")
    print("\nPending:")
    for task in manager.list_pending():
        print(f"  {task}")


if __name__ == "__main__":
    main()

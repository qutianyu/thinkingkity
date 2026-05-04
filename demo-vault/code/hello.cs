using System;
using System.Collections.Generic;
using System.Linq;

namespace ThinkingKity.Demo;

public enum Priority { Low, Medium, High }

public record Task(
    string Title,
    Priority Priority,
    bool Completed = false
);

public class TaskManager
{
    private readonly List<Task> _tasks = new();

    public void Add(string title, Priority priority) =>
        _tasks.Add(new Task(title, priority));

    public void Complete(string title)
    {
        var index = _tasks.FindIndex(t => t.Title == title);
        if (index >= 0)
            _tasks[index] = _tasks[index] with { Completed = true };
    }

    public IEnumerable<Task> PendingByPriority() =>
        _tasks
            .Where(t => !t.Completed)
            .OrderByDescending(t => t.Priority);

    public void PrintSummary()
    {
        var groups = _tasks
            .Where(t => !t.Completed)
            .GroupBy(t => t.Priority)
            .Select(g => new { Priority = g.Key, Count = g.Count() });

        Console.WriteLine("Pending tasks by priority:");
        foreach (var g in groups)
            Console.WriteLine($"  {g.Priority}: {g.Count}");
    }

    public static void Main()
    {
        var tm = new TaskManager();
        tm.Add("Write unit tests", Priority.High);
        tm.Add("Update README", Priority.Medium);
        tm.Add("Fix typos in docs", Priority.Low);
        tm.Add("Refactor auth module", Priority.High);
        tm.Complete("Update README");

        tm.PrintSummary();

        Console.WriteLine("\nSorted pending:");
        foreach (var t in tm.PendingByPriority())
            Console.WriteLine($"  [{t.Priority}] {t.Title}");
    }
}

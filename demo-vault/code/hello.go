// A sample Go program demonstrating interfaces, goroutines, and error handling.

package main

import (
	"fmt"
	"sort"
	"strings"
	"sync"
)

type Priority int

const (
	Low Priority = iota
	Medium
	High
)

func (p Priority) String() string {
	switch p {
	case High:
		return "HIGH"
	case Medium:
		return "MEDIUM"
	default:
		return "LOW"
	}
}

type Task struct {
	Title    string
	Priority Priority
	Done     bool
}

func NewTask(title string, priority Priority) Task {
	return Task{Title: title, Priority: priority}
}

func (t *Task) MarkDone() {
	t.Done = true
}

func (t Task) Summary() string {
	status := " "
	if t.Done {
		status = "x"
	}
	return fmt.Sprintf("[%s] %s (%s)", status, t.Title, t.Priority)
}

type TaskManager struct {
	mu    sync.Mutex
	tasks []Task
}

func (tm *TaskManager) Add(task Task) {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	tm.tasks = append(tm.tasks, task)
}

func (tm *TaskManager) Pending() []Task {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	var pending []Task
	for _, t := range tm.tasks {
		if !t.Done {
			pending = append(pending, t)
		}
	}
	return pending
}

func (tm *TaskManager) Find(title string) (*Task, bool) {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	for i, t := range tm.tasks {
		if strings.EqualFold(t.Title, title) {
			return &tm.tasks[i], true
		}
	}
	return nil, false
}

func (tm *TaskManager) SortByPriority() {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	sort.SliceStable(tm.tasks, func(i, j int) bool {
		return tm.tasks[i].Priority > tm.tasks[j].Priority
	})
}

func main() {
	manager := TaskManager{}
	manager.Add(NewTask("Deploy to production", High))
	manager.Add(NewTask("Write unit tests", High))
	manager.Add(NewTask("Update README", Low))

	fmt.Println("Pending tasks:")
	for _, t := range manager.Pending() {
		fmt.Println(" ", t.Summary())
	}

	if task, ok := manager.Find("Write unit tests"); ok {
		task.MarkDone()
		fmt.Printf("\nMarked done: %s\n", task.Summary())
	}

	manager.SortByPriority()
	fmt.Printf("\nSorted by priority: %d tasks\n", len(manager.tasks))
}

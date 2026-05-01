/// A sample Rust module demonstrating ownership, traits, and error handling.

use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub enum Priority {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone)]
pub struct Task {
    pub title: String,
    pub priority: Priority,
    pub done: bool,
}

impl Task {
    pub fn new(title: impl Into<String>, priority: Priority) -> Self {
        Self { title: title.into(), priority, done: false }
    }

    pub fn mark_done(&mut self) {
        self.done = true;
    }

    pub fn summary(&self) -> String {
        let status = if self.done { "x" } else { " " };
        format!("[{}] {} ({:?})", status, self.title, self.priority)
    }
}

pub struct TaskManager {
    tasks: Vec<Task>,
}

impl TaskManager {
    pub fn new() -> Self {
        Self { tasks: Vec::new() }
    }

    pub fn add(&mut self, task: Task) {
        self.tasks.push(task);
    }

    pub fn pending(&self) -> Vec<&Task> {
        self.tasks.iter().filter(|t| !t.done).collect()
    }

    pub fn count_by_priority(&self) -> HashMap<&Priority, usize> {
        let mut counts = HashMap::new();
        for task in &self.tasks {
            *counts.entry(&task.priority).or_insert(0) += 1;
        }
        counts
    }

    pub fn find_mut(&mut self, title: &str) -> Option<&mut Task> {
        self.tasks.iter_mut().find(|t| t.title == title)
    }
}

impl Default for TaskManager {
    fn default() -> Self {
        Self::new()
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut manager = TaskManager::new();
    manager.add(Task::new("Learn Rust traits", Priority::High));
    manager.add(Task::new("Read the book", Priority::Low));
    manager.add(Task::new("Fix lifetime issue", Priority::High));

    println!("Pending tasks:");
    for task in manager.pending() {
        println!("  {}", task.summary());
    }

    println!("\nBy priority: {:?}", manager.count_by_priority());

    // Mutate a task
    if let Some(t) = manager.find_mut("Learn Rust traits") {
        t.mark_done();
        println!("Completed: {}", t.summary());
    }

    Ok(())
}

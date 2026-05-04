import { useState, useEffect, useCallback, type FormEvent } from "react";

// ── Types ──────────────────────────────────────────────

interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: Date;
}

type Filter = "all" | "active" | "done";

// ── Helpers ────────────────────────────────────────────

function createTodo(text: string): Todo {
  return {
    id: crypto.randomUUID(),
    text: text.trim(),
    done: false,
    createdAt: new Date(),
  };
}

function filterTodos(todos: Todo[], filter: Filter): Todo[] {
  switch (filter) {
    case "active": return todos.filter((t) => !t.done);
    case "done":   return todos.filter((t) => t.done);
    default:       return todos;
  }
}

// ── Component ──────────────────────────────────────────

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const visible = filterTodos(todos, filter);
  const remaining = todos.filter((t) => !t.done).length;

  const handleSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setTodos((prev) => [...prev, createTodo(text)]);
    setText("");
  }, [text]);

  const toggle = useCallback((id: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  }, []);

  const clearDone = useCallback(() => {
    setTodos((prev) => prev.filter((t) => !t.done));
  }, []);

  // Log stats on change
  useEffect(() => {
    console.log(`Todos: ${todos.length} total, ${remaining} remaining`);
  }, [todos.length, remaining]);

  return (
    <div className="app max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Todo App (TSX Demo)</h1>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What needs to be done?"
          className="flex-1 border rounded px-3 py-2"
        />
        <button type="submit" className="btn-primary px-4 py-2 rounded">
          Add
        </button>
      </form>

      <div className="flex gap-2 mb-4">
        {(["all", "active", "done"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded text-sm ${
              filter === f ? "bg-blue-500 text-white" : "bg-gray-200"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <ul className="space-y-2 mb-4">
        {visible.map((todo) => (
          <li
            key={todo.id}
            onClick={() => toggle(todo.id)}
            className={`flex items-center gap-3 p-3 border rounded cursor-pointer ${
              todo.done ? "line-through text-gray-400" : ""
            }`}
          >
            <span>{todo.done ? "✓" : "○"}</span>
            <span>{todo.text}</span>
          </li>
        ))}
      </ul>

      <div className="flex justify-between text-sm text-gray-500">
        <span>{remaining} item{remaining !== 1 ? "s" : ""} left</span>
        <button onClick={clearDone}>Clear completed</button>
      </div>
    </div>
  );
}

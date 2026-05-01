/**
 * A collection of utility functions — vanilla JavaScript demo.
 */

// ── Array helpers ──────────────────────────────────────

export function chunk(arr, size) {
  if (size <= 0) throw new RangeError("Size must be positive");
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export function groupBy(arr, fn) {
  const map = new Map();
  for (const item of arr) {
    const key = typeof fn === "function" ? fn(item) : item[fn];
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return Object.fromEntries(map);
}

export function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ── String helpers ─────────────────────────────────────

export function toCamelCase(str) {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

export function truncate(str, maxLength = 80) {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

// ── Async helpers ──────────────────────────────────────

export async function retry(fn, { maxAttempts = 3, delayMs = 1000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  throw lastError;
}

export function debounce(fn, delayMs = 300) {
  let timer;
  const debounced = function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delayMs);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

// ── Demo ───────────────────────────────────────────────

if (typeof window === "undefined") {
  // Node.js quick test
  const items = ["apple", "banana", "cherry", "date", "elderberry", "fig"];
  console.log("chunk(3):", chunk(items, 3));
  console.log("truncate:", truncate("The quick brown fox jumps over the lazy dog", 24));
}

/**
 * A sample TypeScript utility module.
 * Demonstrates interfaces, generics, and async patterns.
 */

export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  createdAt: Date;
}

export type CreateUserInput = Omit<User, "id" | "createdAt">;

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

function generateId(): string {
  return crypto.randomUUID();
}

export function createUser(input: CreateUserInput): User {
  return {
    ...input,
    id: generateId(),
    createdAt: new Date(),
  };
}

export function filterUsers(users: User[], role: User["role"]): User[] {
  return users.filter((user) => user.role === role);
}

export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number = 10,
): PaginatedResult<T> {
  const start = (page - 1) * pageSize;
  const paged = items.slice(start, start + pageSize);
  return {
    items: paged,
    total: items.length,
    page,
    pageSize,
    hasMore: start + pageSize < items.length,
  };
}

export async function fetchUsers(): Promise<User[]> {
  const response = await fetch("/api/users");
  if (!response.ok) {
    throw new Error(`Failed to fetch users: ${response.statusText}`);
  }
  return response.json();
}

// Example usage
const demoUser = createUser({
  name: "Alice",
  email: "alice@example.com",
  role: "editor",
});

console.log("Created user:", demoUser);

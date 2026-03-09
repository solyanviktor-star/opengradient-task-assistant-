import type { Task } from '@/lib/types';

/**
 * Local storage layer using chrome.storage.local.
 */

/**
 * Save tasks to chrome.storage.local.
 * Deduplicates by task.id -- skips tasks whose ID already exists.
 */
export async function saveTasksLocally(tasks: Task[]): Promise<void> {
  const { tasks: existing = [] } = await chrome.storage.local.get('tasks') as { tasks?: Task[] };
  const existingIds = new Set(existing.map((t) => t.id));
  const newTasks = tasks.filter((t) => !existingIds.has(t.id));
  if (newTasks.length === 0) return;
  await chrome.storage.local.set({ tasks: [...existing, ...newTasks] });
}

/**
 * Read all tasks from chrome.storage.local.
 * Returns them sorted by createdAt descending (newest first).
 * Applies backward compatibility defaults for tasks missing completed/completedAt.
 */
export async function getLocalTasks(): Promise<Task[]> {
  const { tasks = [] } = await chrome.storage.local.get('tasks') as { tasks?: Task[] };
  return tasks
    .map((t) => ({
      ...t,
      completed: t.completed ?? false,
      completedAt: t.completedAt ?? null,
      reminderAt: t.reminderAt ?? null,
    }))
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

/**
 * Update a task by ID with partial fields.
 * Silently no-ops if the task ID is not found.
 */
export async function updateTask(taskId: string, updates: Partial<Task>): Promise<void> {
  const { tasks = [] } = await chrome.storage.local.get('tasks') as { tasks?: Task[] };
  const updated = tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t));
  await chrome.storage.local.set({ tasks: updated });
}

/**
 * Delete a task by ID.
 * Silently no-ops if the task ID is not found.
 */
export async function deleteTask(taskId: string): Promise<void> {
  const { tasks = [] } = await chrome.storage.local.get('tasks') as { tasks?: Task[] };
  const filtered = tasks.filter((t) => t.id !== taskId);
  await chrome.storage.local.set({ tasks: filtered });
}

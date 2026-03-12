import type { Task, TagPattern } from '@/lib/types';

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
      category: t.category ?? 'general',
      tags: t.tags ?? (t.category && t.category !== 'general' ? [t.category] : []),
      reminderNote: t.reminderNote ?? null,
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

// ---------------------------------------------------------------------------
// Tag pattern learning
// ---------------------------------------------------------------------------

const TAG_PATTERNS_KEY = 'tagPatterns';
const MAX_PATTERNS = 30;

/** Record a user tag edit for AI learning. Keeps last MAX_PATTERNS entries. */
export async function recordTagEdit(task: Task, newTags: string[]): Promise<void> {
  const { [TAG_PATTERNS_KEY]: existing = [] } = await chrome.storage.local.get(TAG_PATTERNS_KEY) as { tagPatterns?: TagPattern[] };

  const pattern: TagPattern = {
    snippet: task.action.slice(0, 80),
    type: task.type,
    aiCategory: task.category,
    userTags: newTags,
    timestamp: new Date().toISOString(),
  };

  const updated = [...existing, pattern].slice(-MAX_PATTERNS);
  await chrome.storage.local.set({ [TAG_PATTERNS_KEY]: updated });
}

/** Get stored tag patterns for prompt injection. */
export async function getTagPatterns(): Promise<TagPattern[]> {
  const { [TAG_PATTERNS_KEY]: patterns = [] } = await chrome.storage.local.get(TAG_PATTERNS_KEY) as { tagPatterns?: TagPattern[] };
  return patterns;
}

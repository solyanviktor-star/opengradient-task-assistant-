import type { Task } from '@/lib/types';
import { MemSyncClient } from '@/lib/memsync';

/**
 * Offline-first dual-write storage layer.
 *
 * Saves tasks to chrome.storage.local first (instant, works offline),
 * then optionally syncs to MemSync cloud. Failed syncs are marked for
 * retry without blocking the user.
 */

/**
 * Save tasks to chrome.storage.local.
 * Deduplicates by task.id -- skips tasks whose ID already exists.
 * Does NOT call MemSync -- that is handled separately.
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
 */
export async function getLocalTasks(): Promise<Task[]> {
  const { tasks = [] } = await chrome.storage.local.get('tasks') as { tasks?: Task[] };
  return tasks.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Sync tasks to MemSync cloud storage.
 *
 * - Reads MemSync API key from chrome.storage.local (key: 'memsyncApiKey')
 * - If no API key, logs a warning and returns silently (MemSync is optional for MVP)
 * - On success, marks tasks as synced in chrome.storage.local
 * - On failure, calls markForRetry and logs a warning
 */
export async function syncToMemSync(tasks: Task[]): Promise<void> {
  const { memsyncApiKey } = await chrome.storage.local.get('memsyncApiKey') as { memsyncApiKey?: string };
  if (!memsyncApiKey) {
    console.warn('[storage] No MemSync API key configured -- skipping cloud sync');
    return;
  }

  const client = new MemSyncClient(memsyncApiKey);
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const threadId = `tasks-${today}`;

  const result = await client.saveMemories(tasks, threadId);

  if (result.success) {
    // Mark tasks as synced in chrome.storage.local
    const { tasks: allTasks = [] } = await chrome.storage.local.get('tasks') as { tasks?: Task[] };
    const syncedIds = new Set(tasks.map((t) => t.id));
    const updated = allTasks.map((t) =>
      syncedIds.has(t.id) ? { ...t, synced: true } : t,
    );
    await chrome.storage.local.set({ tasks: updated });
    console.log(`[storage] Synced ${tasks.length} tasks to MemSync`);
  } else {
    console.warn('[storage] MemSync sync failed:', result.error);
    await markForRetry(tasks);
  }
}

/**
 * Mark tasks for MemSync retry.
 *
 * Adds task IDs to a deduped retry queue in chrome.storage.local.
 * Actual retry logic is deferred to Phase 3+.
 */
export async function markForRetry(tasks: Task[]): Promise<void> {
  const { memsyncRetryQueue = [] } = await chrome.storage.local.get('memsyncRetryQueue') as {
    memsyncRetryQueue?: string[];
  };
  const existingIds = new Set(memsyncRetryQueue);
  const newIds = tasks.map((t) => t.id).filter((id) => !existingIds.has(id));
  if (newIds.length === 0) return;
  await chrome.storage.local.set({
    memsyncRetryQueue: [...memsyncRetryQueue, ...newIds],
  });
  console.log(`[storage] Marked ${newIds.length} tasks for MemSync retry`);
}

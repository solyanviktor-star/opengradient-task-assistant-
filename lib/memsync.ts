import type { Task } from '@/lib/types';

/**
 * MemSync REST API client.
 *
 * Wraps the MemSync /v1/memories endpoints for saving and searching
 * task memories. All methods are safe -- they never throw, returning
 * structured error objects instead.
 */
export class MemSyncClient {
  private baseUrl = 'https://api.memchat.io/v1';

  constructor(private apiKey: string) {}

  /**
   * Save tasks as memories in MemSync.
   */
  async saveMemories(
    tasks: Task[],
    threadId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const messages = tasks.map((task) => ({
        role: 'user' as const,
        content: [
          `[${task.type.toUpperCase()}] ${task.action}`,
          task.deadline ? `Deadline: ${task.deadline}` : null,
          `Priority: ${task.priority}`,
          task.context ? `Context: ${task.context}` : null,
          task.tags?.length ? `Tags: ${task.tags.join(', ')}` : null,
          task.txHash ? `TX: ${task.txHash}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      }));

      const response = await fetch(`${this.baseUrl}/memories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify({
          messages,
          agent_id: 'opengradient-task-assistant',
          thread_id: threadId,
          source: 'browser-extension',
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${text}` };
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Search memories in MemSync using semantic search.
   */
  async searchMemories(
    query: string,
    limit = 10,
  ): Promise<{ memories: unknown[]; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/memories/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify({
          query,
          limit,
          rerank: true,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        return { memories: [], error: `HTTP ${response.status}: ${text}` };
      }

      const data = await response.json();
      return { memories: Array.isArray(data) ? data : data.memories ?? [] };
    } catch (err) {
      return {
        memories: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

/** Get MemSync client if API key is configured. Returns null otherwise. */
export async function getMemSyncClient(): Promise<MemSyncClient | null> {
  const { memsyncApiKey } = await chrome.storage.local.get('memsyncApiKey');
  if (!memsyncApiKey) return null;
  return new MemSyncClient(memsyncApiKey as string);
}

/** Auto-sync tasks to MemSync after extraction (fire-and-forget). */
export async function syncTasksToMemSync(tasks: Task[]): Promise<void> {
  const client = await getMemSyncClient();
  if (!client || tasks.length === 0) return;

  const threadId = `tasks-${new Date().toISOString().split('T')[0]}`;
  const result = await client.saveMemories(tasks, threadId);
  if (result.success) {
    console.log(`[MemSync] Synced ${tasks.length} task(s)`);
  } else {
    console.warn('[MemSync] Sync failed:', result.error);
  }
}

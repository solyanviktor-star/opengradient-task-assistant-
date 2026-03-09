import Fuse from 'fuse.js';
import type { Task } from './types';

const fuseOptions: Fuse.IFuseOptions<Task> = {
  keys: [
    { name: 'action', weight: 2 },
    { name: 'context', weight: 1.5 },
    { name: 'type', weight: 0.5 },
    { name: 'priority', weight: 0.3 },
  ],
  threshold: 0.4,
  includeScore: true,
  minMatchCharLength: 2,
};

/**
 * Search tasks using Fuse.js fuzzy matching.
 * Returns all tasks when query is empty; otherwise returns ranked matches.
 *
 * Note: Fuse instance is created each call -- memoization is done
 * in the React layer via useMemo.
 */
export function searchTasks(tasks: Task[], query: string): Task[] {
  if (!query.trim()) return tasks;

  const fuse = new Fuse(tasks, fuseOptions);
  const results = fuse.search(query);
  return results.map((r) => r.item);
}

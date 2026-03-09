export interface Task {
  id: string;                    // Deterministic: hash of sourceUrl + action text
  type: 'call' | 'meeting' | 'task' | 'note' | 'reminder';
  action: string;                // What to do
  deadline: string | null;       // ISO 8601 or null
  priority: 'low' | 'medium' | 'high';
  context: string;               // Additional details
  sourceUrl: string;             // Where extracted from
  platform: 'clipboard' | 'telegram' | 'selection' | 'other';
  createdAt: string;             // ISO 8601
  txHash: string | null;         // On-chain transaction hash from x402 payment
  completed: boolean;            // Whether task is marked complete
  completedAt: string | null;    // ISO 8601 timestamp when completed, or null
  reminderAt: string | null;     // ISO 8601 datetime for scheduled reminder, or null
}

// Message types for content script -> background communication
export interface ExtractTasksMessage {
  type: 'EXTRACT_TASKS';
  payload: {
    text: string;
    sourceUrl: string;
    platform: Task['platform'];
  };
}

export interface ExtractTasksResponse {
  success: boolean;
  tasks?: Task[];
  txHash?: string | null;
  error?: string;
}

// Message type for background/popup -> content script trigger
export interface TriggerExtractionMessage {
  type: 'TRIGGER_EXTRACTION';
  platform?: Task['platform'];
}

export interface TriggerExtractionResponse {
  text: string;
  url: string;
  platform: Task['platform'];
}

/**
 * Generate a deterministic task ID from sourceUrl + action text.
 * Uses a simple string hash (no crypto dependency needed, just for dedup).
 */
export function generateTaskId(sourceUrl: string, action: string): string {
  const input = `${sourceUrl}::${action}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `task_${Math.abs(hash).toString(36)}`;
}

/**
 * Item types the AI can extract from any input.
 *
 * - task: action item, to-do
 * - meeting: scheduled event, call, appointment
 * - reminder: time-based nudge ("напиши мне завтра", "don't forget")
 * - note: general information worth saving
 * - bookmark: saved post/content from social media
 * - credential: password, key, login, seed phrase
 * - contact: person info, phone number, handle
 * - commitment: promise, obligation ("я тебе верну", "will send by Friday")
 * - idea: project idea, business thought, concept
 * - resource: link, article, tool, reference
 */
export type ItemType =
  | 'task'
  | 'meeting'
  | 'reminder'
  | 'note'
  | 'bookmark'
  | 'credential'
  | 'contact'
  | 'commitment'
  | 'idea'
  | 'resource';

export interface Task {
  id: string;
  type: ItemType;
  action: string;                // Main content / what to do / what to remember
  deadline: string | null;       // ISO 8601 or null
  priority: 'low' | 'medium' | 'high';
  context: string;               // Additional details, names, tags, themes
  category: string;              // AI-assigned topic: "crypto", "work", "personal", "finance", etc.
  sourceUrl: string;             // Where extracted from
  platform: 'clipboard' | 'telegram' | 'twitter' | 'discord' | 'selection' | 'other';
  createdAt: string;             // ISO 8601
  txHash: string | null;         // On-chain transaction hash from x402 payment
  completed: boolean;
  completedAt: string | null;
  reminderAt: string | null;     // ISO 8601 datetime for scheduled reminder, or null
  tags: string[];                // User-editable tags (AI category becomes first tag)
  reminderNote: string | null;   // Optional note attached to a reminder
}

/** Recorded when user edits tags — used to teach AI user preferences */
export interface TagPattern {
  snippet: string;       // First 80 chars of task.action
  type: ItemType;
  aiCategory: string;    // What AI originally assigned
  userTags: string[];    // What user ended up with
  timestamp: string;
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

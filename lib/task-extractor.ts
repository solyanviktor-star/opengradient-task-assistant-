/**
 * Task extraction prompt engineering and robust LLM response parser.
 *
 * This module is pure data transformation -- no network calls, no side effects.
 * It provides the system prompt for structured JSON extraction, a resilient parser
 * that handles common LLM output malformations, and validation helpers.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw task shape returned by the LLM parser (before enrichment with IDs, metadata, etc.) */
export type RawTask = {
  type: "call" | "meeting" | "task" | "note" | "reminder";
  action: string;
  deadline: string | null;
  priority: "low" | "medium" | "high";
  context: string;
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_TYPES = ["call", "meeting", "task", "note", "reminder"] as const;
const VALID_PRIORITIES = ["low", "medium", "high"] as const;

/** Returns the type if valid, 'task' otherwise. */
export function validateType(t: string): RawTask["type"] {
  return (VALID_TYPES as readonly string[]).includes(t)
    ? (t as RawTask["type"])
    : "task";
}

/** Returns the priority if valid, 'medium' otherwise. */
export function validatePriority(p: string): RawTask["priority"] {
  return (VALID_PRIORITIES as readonly string[]).includes(p)
    ? (p as RawTask["priority"])
    : "medium";
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

/**
 * System prompt for task extraction. Instructs the LLM to:
 * - Analyze text and extract action items, tasks, meetings, reminders, commitments
 * - Return ONLY a valid JSON array (no markdown, no explanation, no preamble)
 * - Use a strict schema per object
 * - Return [] when no action items are found
 *
 * Includes few-shot examples for deterministic formatting.
 */
export const TASK_EXTRACTION_SYSTEM_PROMPT = `You are a task extraction AI. Your ONLY job is to analyze the provided text and extract any action items, tasks, meetings, reminders, or commitments.

RULES:
1. Return ONLY a valid JSON array. No markdown code fences, no explanation, no preamble, no trailing text.
2. Each object in the array MUST have exactly these fields:
   - "type": one of "call", "meeting", "task", "note", "reminder"
   - "action": a brief, clear description of what needs to be done (string)
   - "deadline": an ISO 8601 datetime string if a specific date or time is mentioned, otherwise null
   - "priority": one of "low", "medium", "high" (infer from urgency cues like "ASAP", "urgent", "when you get a chance")
   - "context": additional details such as names, locations, references, or background info (string)
3. If no action items are found in the text, return an empty array: []
4. Do NOT invent tasks that are not in the text. Only extract what is explicitly stated or strongly implied.

EXAMPLES:

Input: "Hey, don't forget we have the design review meeting tomorrow at 3pm in Room 204. Also, can you send me the Q1 report by Friday?"
Output: [{"type":"meeting","action":"Attend design review meeting","deadline":"2026-03-02T15:00:00","priority":"medium","context":"Room 204, design review"},{"type":"task","action":"Send Q1 report","deadline":"2026-03-07T23:59:00","priority":"medium","context":"Requested Q1 report delivery"}]

Input: "Call mom tonight, it's her birthday"
Output: [{"type":"call","action":"Call mom","deadline":null,"priority":"high","context":"Mom's birthday"}]

Input: "Nice weather today, isn't it?"
Output: []`;

// ---------------------------------------------------------------------------
// LLM response parser
// ---------------------------------------------------------------------------

/**
 * Parse the raw LLM response content into an array of RawTask objects.
 *
 * Handles common LLM output issues:
 * - Markdown code fences (```json ... ```)
 * - Extra text before/after the JSON array
 * - Invalid/malformed JSON (returns [])
 * - Missing fields (fills with defaults)
 * - Extra fields (ignores them)
 * - Single object instead of array (wraps in array)
 *
 * NEVER throws -- always returns an array (possibly empty).
 */
export function parseTasksFromLLMResponse(content: string): RawTask[] {
  if (!content || typeof content !== "string") {
    return [];
  }

  let cleaned = content.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/, "").replace(/\n?\s*```\s*$/, "");
    cleaned = cleaned.trim();
  }

  // Attempt 1: Direct JSON.parse
  const result = tryParseAndNormalize(cleaned);
  if (result !== null) {
    return result;
  }

  // Attempt 2: Extract JSON array from surrounding text
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    const extracted = tryParseAndNormalize(arrayMatch[0]);
    if (extracted !== null) {
      return extracted;
    }
  }

  // Attempt 3: Extract single JSON object from surrounding text
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    const extracted = tryParseAndNormalize(objectMatch[0]);
    if (extracted !== null) {
      return extracted;
    }
  }

  // All attempts failed -- return empty array
  return [];
}

/**
 * Try to parse a string as JSON and normalize the result into RawTask[].
 * Returns null if parsing fails.
 */
function tryParseAndNormalize(text: string): RawTask[] | null {
  try {
    const parsed: unknown = JSON.parse(text);

    // Single object -- wrap in array
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return normalizeTaskArray([parsed]);
    }

    // Array -- normalize each element
    if (Array.isArray(parsed)) {
      return normalizeTaskArray(parsed);
    }

    // Something else (string, number, etc.) -- not useful
    return null;
  } catch {
    return null;
  }
}

/**
 * Normalize an array of unknown objects into valid RawTask[].
 * Filters out entries that lack a usable "action" field.
 */
function normalizeTaskArray(items: unknown[]): RawTask[] {
  return items
    .filter(
      (item): item is Record<string, unknown> =>
        item !== null && typeof item === "object" && !Array.isArray(item),
    )
    .map((item) => ({
      type: validateType(String(item.type ?? "task")),
      action: String(item.action ?? ""),
      deadline: item.deadline != null ? String(item.deadline) : null,
      priority: validatePriority(String(item.priority ?? "medium")),
      context: String(item.context ?? ""),
    }))
    .filter((task) => task.action.length > 0); // Drop entries with no action text
}

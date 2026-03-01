# Phase 2: Extraction + AI + Storage Pipeline - Research

**Researched:** 2026-03-01
**Domain:** Content extraction from web pages, OpenGradient TEE-verified LLM inference via x402, dual storage (chrome.storage.local + MemSync API)
**Confidence:** MEDIUM (content extraction is HIGH; LLM structured output is MEDIUM; MemSync API is MEDIUM; TEE attestation visibility is LOW)

## Summary

Phase 2 builds the core end-to-end pipeline: extract text from Telegram Web (and one additional platform), send it to OpenGradient's TEE-verified LLM via the x402 gateway proven in Phase 1, parse structured task data from the response, and persist tasks in both chrome.storage.local (offline-first) and MemSync (cloud sync). The x402 payment flow is already working -- this phase focuses on the content script layer, the LLM prompt engineering for structured extraction, and the dual-write storage pattern.

Telegram Web A (web.telegram.org/a) is built on the open-source telegram-tt project using a custom React-like framework called Teact with CSS modules. Messages use the CSS class `.Message.message-list-item` with text in `.text-content` divs and message IDs in `data-message-id` attributes on marker elements. Because telegram-tt uses CSS modules with potentially hashed class names in production builds, the extraction strategy should rely on the stable data attributes (`data-message-id`) and semantic class names (`Message`, `text-content`, `bubble`) that are present in the source and unlikely to change between builds.

OpenGradient's LLM endpoint at llm.opengradient.ai supports `anthropic/claude-4.0-sonnet` (among 16+ models), which is the project's target model. The response follows the OpenAI chat completions format. The critical discovery for this phase is the X-PAYMENT-RESPONSE header: it is base64-encoded JSON containing a `transaction` field with the on-chain transaction hash. Combined with settlement mode `SETTLE_METADATA` (set via `X-SETTLEMENT-TYPE: individual` header), this records full input/output metadata on-chain, satisfying the TEE attestation requirement (AI-05, AI-06, AI-07).

MemSync has a well-documented REST API at `https://api.memchat.io/v1` using `X-API-Key` header authentication. The `POST /v1/memories` endpoint accepts conversation messages with agent_id and thread_id, while `POST /v1/memories/search` provides semantic search with reranking. Memory types are automatically classified as semantic (long-term facts) or episodic (temporary situations).

**Primary recommendation:** Use the existing x402 client to call `anthropic/claude-4.0-sonnet` with a structured JSON extraction prompt, decode the X-PAYMENT-RESPONSE header for the transaction hash, store tasks locally first (chrome.storage.local), then sync to MemSync asynchronously. Content scripts should be separate WXT entrypoints per platform, using MutationObserver for SPA navigation detection.

## Standard Stack

### Core (Already Installed from Phase 1)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WXT | 0.20.17 | Extension framework with content script support | Already in use. Supports multiple content scripts via separate entrypoint files, auto-registers matches in manifest. |
| @x402/fetch | ^2.3.0 | x402 payment-gated HTTP client | Already in use. Handles 402 flow for OpenGradient LLM calls. |
| @x402/evm | ^2.3.1 | EVM payment scheme + custom UptoEvmScheme | Already in use. Signs Permit2 transfers for OG's custom contracts. |
| viem | ^2.45.3 | Ethereum utilities | Already in use. Provides privateKeyToAccount for EIP-712 signing. |
| React 19 | ^19.2.4 | UI framework | Already in use for popup. |
| Tailwind CSS 4 | ^4.1.18 | Styling | Already in use. |

### New Dependencies for Phase 2
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None required | - | - | All HTTP calls use native fetch (x402-wrapped or plain). MemSync is a simple REST API. No new npm packages needed. |

**Key insight:** Phase 2 requires zero new npm dependencies. The x402 client wraps fetch for LLM calls. MemSync uses plain fetch with API key auth. Content extraction is pure DOM manipulation. This keeps the bundle small and avoids dependency conflicts.

**Installation:**
```bash
# No new packages needed. Existing stack covers all Phase 2 requirements.
```

## Architecture Patterns

### Recommended Project Structure (Phase 2 Additions)
```
entrypoints/
  background.ts                    # MODIFY: Add EXTRACT_TASKS, SAVE_TASKS handlers
  popup/App.tsx                    # MODIFY: Add task list view
  content/
    telegram.content.ts            # NEW: Telegram Web content script
    gmail.content.ts               # NEW: Gmail content script (second platform)
lib/
  opengradient.ts                  # MODIFY: Add extractTasks() function
  task-extractor.ts                # NEW: LLM prompt + response parsing
  storage.ts                       # NEW: Dual-write storage layer
  memsync.ts                       # NEW: MemSync REST API client
  types.ts                         # NEW: Shared Task type definitions
```

### Pattern 1: Separate Content Scripts per Platform
**What:** WXT allows multiple content script entrypoints. Each file in `entrypoints/` with a `.content.ts` suffix becomes a separate content script registered in the manifest with its own `matches` pattern.
**When to use:** When different platforms have different DOM structures requiring different extraction logic.
**Source:** [WXT Content Scripts docs](https://wxt.dev/guide/essentials/content-scripts)

```typescript
// entrypoints/content/telegram.content.ts
export default defineContentScript({
  matches: ['*://web.telegram.org/*'],
  runAt: 'document_idle',
  main(ctx) {
    // Telegram-specific extraction logic
  },
});

// entrypoints/content/gmail.content.ts
export default defineContentScript({
  matches: ['*://mail.google.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    // Gmail-specific extraction logic
  },
});
```

### Pattern 2: Content Script -> Background Message Flow
**What:** Content scripts extract text, then send it to the background service worker via `browser.runtime.sendMessage`. The service worker handles the x402 LLM call (which requires the private key from session storage) and returns structured tasks.
**When to use:** Always -- content scripts cannot access chrome.storage.session (where the private key lives) and should not make x402 calls directly.

```typescript
// Content script sends extracted text
const response = await browser.runtime.sendMessage({
  type: 'EXTRACT_TASKS',
  payload: {
    text: extractedText,
    sourceUrl: window.location.href,
    platform: 'telegram',
  },
});

// Background handles LLM call + storage
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_TASKS') {
    handleExtractTasks(message.payload)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async
  }
});
```

### Pattern 3: Offline-First Dual-Write Storage
**What:** Save to chrome.storage.local first (immediate, works offline), then async sync to MemSync. Never block the user on network calls.
**When to use:** For all task persistence operations.

```typescript
async function saveTasks(tasks: Task[]): Promise<void> {
  // 1. Save locally first (offline-first)
  const { tasks: existing = [] } = await chrome.storage.local.get('tasks');
  const updated = [...existing, ...tasks];
  await chrome.storage.local.set({ tasks: updated });

  // 2. Async sync to MemSync (best-effort, don't block)
  syncToMemSync(tasks).catch(err => {
    console.warn('[storage] MemSync sync failed, will retry:', err);
    markForRetry(tasks);
  });
}
```

### Pattern 4: X-PAYMENT-RESPONSE Transaction Hash Extraction
**What:** After each x402 LLM call, decode the X-PAYMENT-RESPONSE header to get the on-chain transaction hash. This satisfies AI-06 (attestation) and AI-07 (tx hash).
**When to use:** Every LLM inference call.
**Source:** [x402 spec](https://build.avax.network/academy/blockchain/x402-payment-infrastructure/03-technical-architecture/04-x-payment-response-header)

```typescript
async function extractTasksWithProof(
  x402Fetch: typeof fetch,
  text: string
): Promise<{ tasks: Task[]; txHash: string | null }> {
  const response = await x402Fetch(OG_LLM_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      'X-SETTLEMENT-TYPE': 'individual', // Records full metadata on-chain
    },
    body: JSON.stringify({
      model: 'anthropic/claude-4.0-sonnet',
      messages: [
        { role: 'system', content: TASK_EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      max_tokens: 2000,
      temperature: 0.1,
    }),
  });

  // Extract transaction hash from x402 payment response
  let txHash: string | null = null;
  const paymentResponse = response.headers.get('x-payment-response');
  if (paymentResponse) {
    try {
      const decoded = JSON.parse(atob(paymentResponse));
      txHash = decoded.transaction ?? null;
    } catch { /* header decode failed -- non-fatal */ }
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  const tasks = parseTasksFromLLMResponse(content);

  return { tasks, txHash };
}
```

### Pattern 5: MutationObserver for SPA Navigation
**What:** Telegram Web A and Gmail are SPAs -- they change content without full page reloads. Use MutationObserver to detect when new messages appear, and WXT's `wxt:locationchange` event for URL changes.
**When to use:** All SPA-based content scripts.

```typescript
// WXT SPA navigation detection
export default defineContentScript({
  matches: ['*://web.telegram.org/*'],
  main(ctx) {
    // Watch for URL changes (SPA navigation)
    ctx.addEventListener(window, 'wxt:locationchange', ({ newUrl }) => {
      // Re-evaluate extraction target
    });

    // Watch for new messages appearing in DOM
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement && node.classList.contains('Message')) {
            // New message appeared
          }
        }
      }
    });

    const chatContainer = document.querySelector('#MiddleColumn');
    if (chatContainer) {
      observer.observe(chatContainer, { childList: true, subtree: true });
    }
  },
});
```

### Anti-Patterns to Avoid
- **Making x402 calls from content scripts:** Content scripts run in the page context and cannot access chrome.storage.session. Always route through the background service worker.
- **Blocking on MemSync before confirming to user:** MemSync is a network call that can fail. Always save locally first, show success, then sync async.
- **Parsing LLM output with regex:** Use JSON.parse with try/catch. Instruct the LLM to return JSON and validate the structure.
- **Scraping all messages on page load:** Only extract visible/recent messages to avoid performance issues. Let the user trigger extraction explicitly (click extension icon).
- **Assuming stable CSS class names in Telegram Web A:** telegram-tt uses CSS modules that may hash class names. Prefer data attributes (`data-message-id`) and semantic HTML structure over exact class strings.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| x402 payment flow | Custom 402 handling | `createX402Client()` from Phase 1 | Already proven working. Handles signing, nonce, retry. |
| JSON extraction from LLM | Regex parsing | Structured prompt + JSON.parse | LLMs are unreliable with exact formats. JSON.parse catches malformed output; regex misses edge cases. |
| SPA navigation detection | Custom pushState monkey-patching | WXT `wxt:locationchange` event | WXT already patches History API and fires custom events. |
| Retry logic for MemSync | Custom retry with exponential backoff | Simple queue in chrome.storage.local | For MVP, just mark failed syncs and retry next time. Full retry logic is Phase 3+. |
| Task deduplication | Custom hash-based dedup | Content-based ID (source URL + message ID + action text hash) | Simple deterministic ID prevents duplicates across local and cloud storage. |

**Key insight:** The LLM is the only genuinely new integration. Everything else (x402, DOM manipulation, chrome.storage, REST API calls) uses standard patterns.

## Common Pitfalls

### Pitfall 1: Service Worker Timeout During LLM Inference
**What goes wrong:** OpenGradient LLM calls through x402 involve: initial request -> 402 response -> payment signing -> re-request -> LLM inference -> response. Total can be 5-20 seconds. If the service worker was already idle for 25 seconds before the message arrives, it may be killed mid-call.
**Why it happens:** Chrome MV3 gives service workers 30 seconds of idle time before termination, and 5 minutes for any single operation.
**How to avoid:** The LLM call is triggered by a message from the content script or popup, which resets the idle timer. A single LLM call (5-20s) is well within the 5-minute operation limit. For Phase 2, this is LOW risk. If problems arise, use chrome.alarms to keep the worker alive during multi-step operations.
**Warning signs:** LLM calls that succeed in dev (DevTools keeps worker alive) but fail intermittently in production.

### Pitfall 2: Telegram Web A Uses Hashed CSS Module Class Names
**What goes wrong:** You write `document.querySelector('.Message')` but the production build of Telegram Web A has transformed it to `.Message_abc123` or similar hashed name.
**Why it happens:** telegram-tt uses SCSS modules with `buildClassName()`. In development builds, class names are readable, but production may hash them.
**How to avoid:** Use multiple selector strategies in order of reliability: (1) `data-message-id` attribute (most stable), (2) semantic class names that are part of the public API (e.g., `Message`, `message-list-item`), (3) DOM structure patterns (e.g., children of `#MiddleColumn`). Test against the LIVE web.telegram.org/a, not the GitHub source.
**Warning signs:** Content script works locally with unbuilt telegram-tt but fails on production web.telegram.org.

### Pitfall 3: LLM Returns Malformed JSON
**What goes wrong:** The LLM is asked to return JSON but wraps it in markdown code blocks, adds explanation text, or returns partial JSON.
**Why it happens:** LLMs are probabilistic. Even with strong prompts, they sometimes deviate from the requested format.
**How to avoid:** (1) Use a system prompt that explicitly says "Respond with ONLY valid JSON, no markdown, no explanation." (2) Strip markdown code fences before parsing. (3) Try JSON.parse, and if it fails, try extracting JSON from between `{` and `}` or `[` and `]`. (4) Set temperature to 0.1 or lower for more deterministic output.
**Warning signs:** Intermittent task extraction failures with "SyntaxError: Unexpected token" in the console.

### Pitfall 4: chrome.storage.local 10MB Quota
**What goes wrong:** After weeks of use, task storage exceeds 10MB and writes silently fail (or throw).
**Why it happens:** Each task with full context text can be 1-5KB. After a few thousand tasks, storage fills up.
**How to avoid:** (1) Store minimal data locally (action text, deadline, priority, IDs -- not full source text). (2) Full text goes to MemSync cloud only. (3) Implement a local eviction policy (keep last 500 tasks, or last 30 days). (4) Consider requesting `unlimitedStorage` permission if needed.
**Warning signs:** `chrome.runtime.lastError` after `chrome.storage.local.set()` calls.

### Pitfall 5: MemSync API Key Management
**What goes wrong:** The MemSync API key is hardcoded in source, visible to anyone who inspects the extension.
**Why it happens:** Unlike the wallet private key (which controls funds), the API key feels "less sensitive."
**How to avoid:** Store the MemSync API key in chrome.storage.local (persists across restarts) or chrome.storage.session (ephemeral). Prompt the user to enter it in the popup settings, similar to the wallet key flow from Phase 1.
**Warning signs:** Any string starting with a known API key format in source code.

### Pitfall 6: Gmail DOM Structure is Extremely Complex
**What goes wrong:** Gmail's DOM uses deeply nested divs with obfuscated class names (single-letter classes like `.gs`, `.a3s`, `.ii`). Selectors that work today break tomorrow when Google updates the frontend.
**Why it happens:** Gmail's frontend is compiled/minified and frequently updated. There is no stable public DOM API.
**How to avoid:** For Gmail as the "second platform" MVP: (1) Use the simplest possible selector strategy -- target the currently open email's body text. (2) Accept that Gmail extraction will be brittle and document it as a known limitation. (3) Alternative: consider using a simpler second platform like WhatsApp Web or a generic "any page" text selection extractor.
**Warning signs:** Gmail extraction works for a week then silently stops extracting content.

## Code Examples

### Task Type Definition
```typescript
// lib/types.ts
export interface Task {
  id: string;                    // Deterministic: hash(sourceUrl + messageId + action)
  type: 'call' | 'meeting' | 'task' | 'note' | 'reminder';
  action: string;                // What to do
  deadline: string | null;       // ISO 8601 or null
  priority: 'low' | 'medium' | 'high';
  context: string;               // Additional details
  sourceUrl: string;             // Where extracted from
  platform: 'telegram' | 'gmail' | 'other';
  createdAt: string;             // ISO 8601
  txHash: string | null;         // On-chain transaction hash from x402
  memsyncId: string | null;      // MemSync memory ID after sync
  synced: boolean;               // Whether synced to MemSync
}
```

### Task Extraction System Prompt
```typescript
// lib/task-extractor.ts
export const TASK_EXTRACTION_SYSTEM_PROMPT = `You are a task extraction AI. Analyze the provided text and extract any action items, tasks, meetings, reminders, or commitments.

Return ONLY a valid JSON array. No markdown, no explanation, no code fences.

Each item in the array must have these fields:
- "type": one of "call", "meeting", "task", "note", "reminder"
- "action": brief description of what to do (string)
- "deadline": ISO 8601 datetime string if a specific date/time is mentioned, or null
- "priority": one of "low", "medium", "high"
- "context": additional details, names, or references (string)

If no action items are found, return an empty array: []

Examples:
Input: "Lets meet tomorrow at 3pm to discuss the project"
Output: [{"type":"meeting","action":"meet to discuss the project","deadline":"2026-03-02T15:00:00","priority":"medium","context":"project discussion"}]

Input: "Nice weather today"
Output: []`;
```

### LLM Response Parser (Robust)
```typescript
// lib/task-extractor.ts
export function parseTasksFromLLMResponse(content: string): Omit<Task, 'id' | 'sourceUrl' | 'platform' | 'createdAt' | 'txHash' | 'memsyncId' | 'synced'>[] {
  // Strip markdown code fences if LLM wraps response
  let cleaned = content.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item: unknown) =>
        item && typeof item === 'object' &&
        'type' in item && 'action' in item
      )
      .map((item: Record<string, unknown>) => ({
        type: validateType(item.type as string),
        action: String(item.action || ''),
        deadline: item.deadline ? String(item.deadline) : null,
        priority: validatePriority(item.priority as string),
        context: String(item.context || ''),
      }));
  } catch {
    // Try to extract JSON array from within the text
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return parseTasksFromLLMResponse(match[0]);
      } catch { /* give up */ }
    }
    return [];
  }
}

function validateType(t: string): Task['type'] {
  const valid = ['call', 'meeting', 'task', 'note', 'reminder'];
  return valid.includes(t) ? t as Task['type'] : 'task';
}

function validatePriority(p: string): Task['priority'] {
  const valid = ['low', 'medium', 'high'];
  return valid.includes(p) ? p as Task['priority'] : 'medium';
}
```

### MemSync Client
```typescript
// lib/memsync.ts
const MEMSYNC_BASE_URL = 'https://api.memchat.io/v1';

export class MemSyncClient {
  constructor(private apiKey: string) {}

  /** Save tasks as memories */
  async saveMemories(tasks: Task[], threadId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${MEMSYNC_BASE_URL}/memories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify({
          messages: tasks.map(task => ({
            role: 'user',
            content: `Task: ${task.action}. Type: ${task.type}. Deadline: ${task.deadline ?? 'none'}. Priority: ${task.priority}. Context: ${task.context}. Source: ${task.sourceUrl}`,
          })),
          agent_id: 'opengradient-task-assistant',
          thread_id: threadId,
          source: 'browser-extension',
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `MemSync HTTP ${response.status}: ${text}` };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Search memories by query */
  async searchMemories(query: string, limit = 10): Promise<{ memories: unknown[]; error?: string }> {
    try {
      const response = await fetch(`${MEMSYNC_BASE_URL}/memories/search`, {
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
        return { memories: [], error: `HTTP ${response.status}` };
      }

      const data = await response.json();
      return { memories: data.memories ?? [] };
    } catch (err) {
      return { memories: [], error: String(err) };
    }
  }
}
```

### Telegram Web Content Extraction
```typescript
// entrypoints/content/telegram.content.ts
export default defineContentScript({
  matches: ['*://web.telegram.org/*'],
  runAt: 'document_idle',
  main(ctx) {
    console.log('[telegram] Content script loaded');

    // Listen for extraction trigger from background/popup
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'TRIGGER_EXTRACTION') {
        const text = extractVisibleMessages();
        sendResponse({ text, url: window.location.href, platform: 'telegram' });
      }
    });
  },
});

function extractVisibleMessages(): string {
  // Strategy 1: Use data attributes (most stable)
  const messageElements = document.querySelectorAll('[data-message-id]');
  if (messageElements.length > 0) {
    return Array.from(messageElements)
      .map(el => {
        const textContent = el.closest('.Message')?.querySelector('.text-content');
        return textContent?.textContent?.trim() ?? '';
      })
      .filter(Boolean)
      .join('\n\n');
  }

  // Strategy 2: Use class names (fallback)
  const bubbles = document.querySelectorAll('.message-list-item .text-content, .bubble .message');
  if (bubbles.length > 0) {
    return Array.from(bubbles)
      .map(el => el.textContent?.trim() ?? '')
      .filter(Boolean)
      .join('\n\n');
  }

  // Strategy 3: Generic text extraction from chat area
  const chatArea = document.querySelector('#MiddleColumn') ??
                   document.querySelector('.messages-container') ??
                   document.querySelector('[class*="chat"]');
  return chatArea?.textContent?.trim() ?? '';
}
```

### Background Service Worker: Extract Tasks Handler
```typescript
// Addition to entrypoints/background.ts
if (message.type === 'EXTRACT_TASKS') {
  (async () => {
    try {
      const { ogPrivateKey } = await chrome.storage.session.get('ogPrivateKey');
      if (!ogPrivateKey) {
        sendResponse({ success: false, error: 'No private key configured' });
        return;
      }

      const x402Fetch = createX402Client(ogPrivateKey as `0x${string}`);
      const { tasks, txHash } = await extractTasksWithProof(
        x402Fetch,
        message.payload.text
      );

      // Enrich tasks with metadata
      const enrichedTasks: Task[] = tasks.map(task => ({
        ...task,
        id: generateTaskId(message.payload.sourceUrl, task.action),
        sourceUrl: message.payload.sourceUrl,
        platform: message.payload.platform,
        createdAt: new Date().toISOString(),
        txHash,
        memsyncId: null,
        synced: false,
      }));

      // Save locally first
      await saveTasksLocally(enrichedTasks);

      // Async sync to MemSync
      syncToMemSync(enrichedTasks).catch(console.warn);

      sendResponse({ success: true, tasks: enrichedTasks, txHash });
    } catch (err) {
      sendResponse({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
  return true;
}
```

## OpenGradient LLM: Available Models

**Source:** [OpenGradient LLM SDK docs](https://docs.opengradient.ai/developers/sdk/llm.html) (verified 2026-03-01)

| Provider | Model ID | Notes |
|----------|----------|-------|
| OpenAI | `openai/gpt-4.1-2025-04-14` | Latest GPT-4.1 |
| OpenAI | `openai/gpt-4o` | Confirmed working in Phase 1 spike |
| OpenAI | `openai/o4-mini` | Reasoning model |
| Anthropic | `anthropic/claude-4.0-sonnet` | **Target model per IDEA.md** |
| Anthropic | `anthropic/claude-3.7-sonnet` | Alternative |
| Anthropic | `anthropic/claude-3.5-haiku` | Faster/cheaper alternative |
| Google | `google/gemini-2.5-flash` | Fast |
| Google | `google/gemini-2.5-pro` | High quality |
| Google | `google/gemini-2.5-flash-lite` | Cheapest |
| Google | `google/gemini-2.0-flash` | Previous gen |
| xAI | `x-ai/grok-3-beta` | |
| xAI | `x-ai/grok-3-mini-beta` | |
| xAI | `x-ai/grok-4.1-fast` | |

**Recommendation:** Use `anthropic/claude-4.0-sonnet` as specified in IDEA.md (AI-02). If it is unavailable or too expensive for testing, fall back to `openai/gpt-4o` which is confirmed working.

## Settlement Modes (TEE Verification)

**Source:** [OpenGradient SDK LLM docs](https://docs.opengradient.ai/developers/sdk/llm.html) (verified 2026-03-01)

| Mode | Header Value | What Gets Recorded On-Chain | Use Case |
|------|-------------|----------------------------|----------|
| SETTLE_BATCH | `settle-batch` | Aggregated batch settlement | Default. Used in Phase 1 spike. Cheapest. |
| SETTLE | (plain settle) | No input/output hashes | Just payment, no verification data. |
| SETTLE_METADATA | `individual` | Full model info, complete input/output data, all metadata | **Required for AI-05/AI-06/AI-07.** Records TEE attestation. |

**Recommendation:** Use `X-SETTLEMENT-TYPE: individual` for task extraction calls to satisfy the cryptographic attestation requirements. The transaction hash from `X-PAYMENT-RESPONSE` header can then be looked up on the OpenGradient block explorer to see full inference metadata.

## MemSync API Reference

**Base URL:** `https://api.memchat.io/v1`
**Auth:** `X-API-Key: <key>` header (or Bearer JWT)
**Source:** [MemSync OpenAPI spec](https://api.memchat.io/openapi.json) (verified 2026-03-01)

### Key Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/memories` | Store conversation messages for memory extraction |
| POST | `/v1/memories/search` | Semantic search across memories |
| GET | `/v1/memories` | Paginated memory retrieval with category filter |
| GET | `/v1/memories/{id}` | Get specific memory by ID |
| DELETE | `/v1/memories/{id}` | Delete a memory |
| GET | `/v1/users/profile` | Get auto-generated user profile |
| GET | `/v1/users/bio` | Get user bio summary |
| POST | `/v1/api-keys` | Create API key |
| GET | `/v1/api-keys` | List API keys |
| GET | `/v1/users/rate-limits` | Check remaining credits |

### POST /v1/memories Request Format
```json
{
  "messages": [
    {"role": "user", "content": "Task: send report. Deadline: Friday. Priority: high."},
    {"role": "assistant", "content": "Noted! I'll remind you."}
  ],
  "agent_id": "opengradient-task-assistant",
  "thread_id": "user-session-123",
  "source": "browser-extension"
}
```

### POST /v1/memories/search Request Format
```json
{
  "query": "What tasks are due this week?",
  "limit": 10,
  "rerank": true
}
```

### Memory Types (Auto-Classified)
- **Semantic:** Long-term facts (identity, career, preferences)
- **Episodic:** Temporary situations (active projects, recent events)

### Memory Categories (Auto-Tagged)
`identity`, `career`, `interests`, `relationships`, `health`, `finance`, `learning`, `travel`, `productivity`, `private`

**Key insight for storage design:** MemSync automatically extracts facts and classifies memories. We don't need to manually categorize -- just send the task data as conversation messages and MemSync's AI handles categorization and semantic indexing.

## Telegram Web A DOM Structure

**Source:** [telegram-tt GitHub](https://github.com/Ajaxy/telegram-tt), verified against source code 2026-03-01

### Key Selectors and Data Attributes

| Element | Selector | Stability | Notes |
|---------|----------|-----------|-------|
| Message container | `.Message.message-list-item` | MEDIUM | CSS module class, readable in source but may be hashed in prod |
| Message ID marker | `[data-message-id]` | HIGH | Data attribute, unlikely to change |
| Text content | `.text-content` | MEDIUM | Used for message body text |
| Own messages | `.Message.own` | MEDIUM | Messages sent by the user |
| Album marker | `[data-album-main-id]` | HIGH | Grouped media messages |
| Middle column | `#MiddleColumn` | HIGH | Main chat area container |
| Unread mention | `[data-has-unread-mention]` | HIGH | Data attribute |

### DOM Hierarchy (from Message.tsx source)
```
<div class="Message message-list-item [own] [first-in-group] [last-in-group]">
  <div class="bottom-marker" data-message-id="..." />
  <div class="message-select-control" />
  <div class="message-content-wrapper">
    <div class="content [has-shadow] [has-solid-background]">
      <div class="message-subheader" />
      <!-- media/sticker/etc -->
      <div class="text-content clearfix [with-meta]">
        <!-- actual message text -->
      </div>
    </div>
  </div>
</div>
```

### Extraction Strategy
1. **Primary:** Query `[data-message-id]` to find all message markers, then navigate to `.text-content` within the same `.Message` ancestor.
2. **Fallback:** Query `.text-content` elements directly.
3. **Last resort:** Get all text from `#MiddleColumn`.

**IMPORTANT:** These selectors are from the open-source telegram-tt repository. The LIVE web.telegram.org/a may use slightly different class names due to CSS module hashing. The content script MUST be tested against the live site, not just the source code. Data attributes (`data-message-id`) are the most reliable anchor.

## Gmail DOM Structure (Second Platform Candidate)

**Confidence:** LOW -- Gmail's DOM is highly obfuscated.

Gmail uses single/double-letter CSS class names (`.gs`, `.a3s`, `.ii`, `.gt`) that change between releases. However, some stable patterns exist:

| Element | Known Selector | Stability | Notes |
|---------|---------------|-----------|-------|
| Email body | `.a3s.aiL` or `.ii.gt` | LOW | Changes frequently |
| Email subject | `h2.hP` | LOW | |
| Thread container | `[role="main"]` | MEDIUM | ARIA roles are more stable |
| Individual emails | `[data-message-id]` | MEDIUM | Gmail also uses data-message-id! |

**Alternative second platform recommendation:** Instead of Gmail (brittle, complex), consider:
1. **Generic "selected text" extraction** -- User selects text on any page, right-clicks, "Extract tasks from selection." Works everywhere, zero platform-specific code.
2. **WhatsApp Web** -- Simpler DOM than Gmail, but similar SPA challenges.
3. **Slack** -- More stable DOM than Gmail, but requires workspace access.

**Recommendation:** For MVP, implement the **generic text selection** approach as the second platform. It satisfies EXTR-05 (works on any platform beyond Telegram) with zero maintenance burden. If time permits, add a Gmail-specific extractor.

## Manifest Permissions Needed

Phase 2 requires additional permissions beyond Phase 1:

```typescript
// wxt.config.ts additions
manifest: {
  permissions: [
    'storage',       // Already have -- chrome.storage.local + session
    'activeTab',     // Already have -- trigger extraction on current tab
  ],
  host_permissions: [
    'https://llm.opengradient.ai/*',    // Already have
    'https://sepolia.base.org/*',        // Already have
    'https://api.memchat.io/*',          // NEW: MemSync API
    'https://web.telegram.org/*',        // NEW: Telegram content script
    'https://mail.google.com/*',         // NEW: Gmail content script (if used)
  ],
}
```

**Note:** Content scripts with `matches` patterns automatically get host access via the manifest content_scripts entry. But the service worker needs explicit `host_permissions` for fetch calls to MemSync.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| LLM free-text output | Structured JSON extraction prompts with validation | 2024-2025 | Parse LLM output as JSON, not regex. Include examples in system prompt. |
| Separate storage and cloud sync | Offline-first with async sync | 2024-2025 (PWA pattern) | Always save locally first. Sync to cloud as best-effort. |
| Static content scripts | MutationObserver + SPA event listeners | MV3 era | SPAs don't trigger page load events. Must observe DOM changes. |
| Manual CSS selector maintenance | Data attribute-based extraction | Ongoing | Data attributes are part of the semantic contract; CSS classes are style implementation details. |
| Single settlement mode | Per-request settlement mode selection | x402 v2 (2025) | Can choose batch (cheap) or individual (full attestation) per request. |

## Open Questions

1. **Exact Telegram Web A production class names**
   - What we know: Source code uses `.Message`, `.text-content`, `data-message-id`. These are readable in the GitHub source.
   - What's unclear: Whether production web.telegram.org/a hashes these class names via CSS modules. The source shows SCSS modules but also plain class strings via `buildClassName()`.
   - Recommendation: Test against live web.telegram.org/a during implementation. If classes are hashed, rely exclusively on `data-message-id` and DOM structure. **Confidence: MEDIUM.**

2. **MemSync API key acquisition**
   - What we know: API uses `X-API-Key` header. OpenAPI spec shows `/v1/api-keys` endpoint. App available at app.memsync.ai.
   - What's unclear: How to get an initial API key. Is it self-service via the web app? Does it require OpenGradient account? Is there a free tier?
   - Recommendation: Sign up at app.memsync.ai during Plan 02-03 implementation. If blocked, use chrome.storage.local only for MVP and add MemSync later. **Confidence: LOW.**

3. **TEE attestation document format**
   - What we know: SETTLE_METADATA mode records "full model info, complete input/output data, and all metadata" on-chain. Transaction hash is returned via X-PAYMENT-RESPONSE header.
   - What's unclear: The exact structure of the attestation document retrievable from the OpenGradient block explorer. The docs say "users can independently verify that their inference actually ran and was recorded" but don't show the verification API.
   - Recommendation: For Phase 2, storing the transaction hash satisfies AI-06 and AI-07. The hash IS the cryptographic reference to the attestation. Detailed attestation inspection can be deferred to Phase 3/4. **Confidence: MEDIUM.**

4. **Cost per LLM call with SETTLE_METADATA**
   - What we know: Phase 1 spike used settle-batch (cheapest). SETTLE_METADATA records more data on-chain.
   - What's unclear: Price difference between batch and individual settlement. Could be 2x-10x more expensive per call.
   - Recommendation: Test with individual settlement early. If too expensive for development, use settle-batch during dev and switch to individual for demo/production. **Confidence: LOW.**

5. **Claude 4.0 Sonnet availability on OpenGradient**
   - What we know: Model ID `anthropic/claude-4.0-sonnet` is listed in the official docs. Phase 1 spike confirmed `openai/gpt-4o` works.
   - What's unclear: Whether Claude 4.0 Sonnet is actually available and working (listed != operational). Pricing may differ from GPT-4o.
   - Recommendation: Try `anthropic/claude-4.0-sonnet` first. If it fails or returns errors, fall back to `openai/gpt-4o` which is proven working. **Confidence: MEDIUM.**

## Sources

### Primary (HIGH confidence)
- [OpenGradient LLM SDK Documentation](https://docs.opengradient.ai/developers/sdk/llm.html) - Model list, settlement modes, chat API (verified 2026-03-01)
- [OpenGradient x402 API Reference](https://docs.opengradient.ai/developers/x402/api-reference) - Request/response format, headers (verified 2026-03-01)
- [MemSync OpenAPI Specification](https://api.memchat.io/openapi.json) - Complete REST API spec with all endpoints (verified 2026-03-01)
- [MemSync Developer Documentation](https://docs.opengradient.ai/developers/memsync) - API base URL, auth, code examples (verified 2026-03-01)
- [telegram-tt GitHub Repository](https://github.com/Ajaxy/telegram-tt) - Source code for Telegram Web A, Message.tsx component (verified 2026-03-01)
- [WXT Content Scripts Documentation](https://wxt.dev/guide/essentials/content-scripts) - Multiple content scripts, SPA detection, UI injection (verified 2026-03-01)
- [x402 X-PAYMENT-RESPONSE Header Spec](https://build.avax.network/academy/blockchain/x402-payment-infrastructure/03-technical-architecture/04-x-payment-response-header) - Transaction hash extraction (verified 2026-03-01)
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) - Quota limits, session vs local (verified 2026-03-01)

### Secondary (MEDIUM confidence)
- [Telegram Media Downloader](https://github.com/Neet-Nestor/Telegram-Media-Downloader) - Real-world Telegram Web DOM selectors: `.bubble`, `data-mid`
- [OpenGradient Architecture: Inference Nodes](https://docs.opengradient.ai/learn/architecture/inference_nodes) - TEE attestation and verification flow
- [OpenGradient MemSync Blog](https://www.opengradient.ai/blog/building-better-ai-memory-the-architecture-behind-memsync) - Memory architecture (semantic vs episodic)

### Tertiary (LOW confidence -- needs validation)
- Telegram Web A production DOM class names -- source code examined but live site may differ due to CSS module hashing
- MemSync API key acquisition process -- OpenAPI spec shows endpoints but sign-up flow not documented
- SETTLE_METADATA cost difference vs settle-batch -- not documented
- Gmail DOM selectors -- highly unstable, based on community reports

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies needed. Phase 1 stack covers all requirements.
- Architecture (content scripts): HIGH - WXT content script patterns well-documented, multiple-file approach is standard.
- Architecture (LLM integration): MEDIUM - Model list verified from docs but Claude 4.0 Sonnet not personally tested.
- Architecture (storage): MEDIUM - chrome.storage.local is standard; MemSync API verified from OpenAPI spec but not tested.
- Pitfalls: HIGH - Service worker lifecycle, SPA extraction, LLM output parsing are well-known challenges with documented solutions.
- TEE attestation: LOW - Transaction hash extraction is clear, but attestation document format is not publicly documented.

**Research date:** 2026-03-01
**Valid until:** 2026-03-31 (30 days -- stack is stable; MemSync API may update; Telegram Web A DOM may change)

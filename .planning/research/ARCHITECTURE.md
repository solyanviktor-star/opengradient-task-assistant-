# Architecture Research

**Domain:** Chrome Extension with AI/LLM Backend (OpenGradient + MemSync)
**Researched:** 2026-02-14
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
BROWSER (Chrome Extension - Manifest V3)
===========================================
  Content Scripts          Popup UI          Options Page
  (page DOM access)        (React/HTML)      (settings)
       |                      |                  |
       |    chrome.runtime.sendMessage / connect  |
       +------------------+  |  +-----------------+
                          |  |  |
                  Background Service Worker
                  (event-driven, wakes on demand)
                     |            |           |
              chrome.alarms  chrome.storage  chrome.notifications
              (reminders)    (.local/.sync)   (task alerts)
                     |
                     | fetch() / x402Fetch()
                     |
===========================================
EXTERNAL SERVICES (HTTP/REST)
===========================================
       |                          |
  OpenGradient x402 Gateway    MemSync REST API
  POST /v1/chat/completions   POST /v1/memories
  (LLM task extraction)       POST /v1/memories/search
  https://llmogevm.            GET  /v1/users/profile
   opengradient.ai             https://api.memchat.io/v1
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Content Script** | Reads webpage DOM, extracts text content from the active page, sends raw content to service worker | Injected JS that traverses DOM, extracts `innerText`, listens for user-triggered extraction |
| **Background Service Worker** | Central orchestrator: receives content from content scripts, calls external APIs, manages alarms/notifications, coordinates all data flow | `background.js` registered in manifest, event-driven, wakes on messages/alarms |
| **Popup UI** | Displays extracted tasks, allows marking complete/snoozing, shows sync status | HTML/CSS/JS popup (or React) triggered by extension icon click |
| **Options Page** | API key configuration, notification preferences, extraction settings | HTML form that writes to `chrome.storage.sync` |
| **OpenGradient x402 Gateway** | AI/LLM inference for task extraction from raw page content | External HTTP API, OpenAI-compatible `/v1/chat/completions` endpoint with x402 payment protocol |
| **MemSync REST API** | Persistent cross-session memory storage and semantic search for tasks/context | External REST API at `api.memchat.io/v1` with API key auth |
| **chrome.storage.local** | Local cache for tasks, settings, and offline access | Built-in Chrome API, persists across sessions |
| **chrome.alarms** | Scheduled task reminders and periodic sync checks | Built-in Chrome API, minimum 30-second interval |
| **chrome.notifications** | Desktop notifications for task reminders | Built-in Chrome API, OS-level notifications |

## Recommended Project Structure

```
extension/
├── manifest.json              # MV3 manifest (permissions, service worker registration)
├── background/
│   ├── service-worker.js      # Main orchestrator, event listeners
│   ├── api/
│   │   ├── opengradient.js    # x402 gateway client (LLM inference)
│   │   └── memsync.js         # MemSync REST client (memory storage)
│   ├── tasks/
│   │   ├── extractor.js       # Prompt construction for task extraction
│   │   ├── scheduler.js       # Alarm management for reminders
│   │   └── store.js           # chrome.storage.local task CRUD
│   └── utils/
│       └── x402-payment.js    # x402 payment signing with ethers.js
├── content/
│   ├── content-script.js      # DOM reader, text extraction
│   └── content-style.css      # Optional page-overlay styles
├── popup/
│   ├── popup.html             # Task list UI shell
│   ├── popup.js               # Task display and interaction logic
│   └── popup.css              # Popup styling
├── options/
│   ├── options.html           # Settings page
│   └── options.js             # Settings logic (API keys, preferences)
├── shared/
│   ├── constants.js           # Shared constants, message types
│   └── types.js               # Shared data structures (JSDoc or TS)
└── icons/                     # Extension icons (16, 48, 128px)
```

### Structure Rationale

- **background/api/:** Isolates external service communication. Each API client is independently testable and replaceable. If OpenGradient or MemSync APIs change, only these files need updating.
- **background/tasks/:** Separates domain logic (extraction, scheduling, storage) from API plumbing. The extractor builds prompts, the scheduler manages alarms, the store handles local persistence.
- **content/:** Minimal footprint. Content scripts run in every matching page, so they must be lean -- extract text and send a message, nothing more.
- **popup/:** Self-contained UI. Reads from `chrome.storage.local` for instant display, sends commands to service worker for actions.
- **shared/:** Message type constants prevent typos in `chrome.runtime.sendMessage` calls. Single source of truth for data shapes.

## Architectural Patterns

### Pattern 1: x402 Gateway as Python SDK Bridge

**What:** Use OpenGradient's x402 HTTP gateway directly from JavaScript instead of running a local Python server. The x402 gateway exposes the same LLM inference as the Python SDK but over standard HTTP with an OpenAI-compatible API format.

**When to use:** Always -- this is the recommended approach. It eliminates the Python dependency entirely.

**Trade-offs:**
- Pro: No local server needed, no Python installation required, pure JavaScript extension
- Pro: OpenAI-compatible API format (`/v1/chat/completions`), well-documented
- Pro: TEE-verified inference with cryptographic proof
- Con: Requires OUSDC tokens on OpenGradient network (Chain ID: 10744) for payment
- Con: Requires wallet private key management in the extension
- Con: Network dependency -- no offline inference

**Example:**
```javascript
// background/api/opengradient.js
import { wrapFetch } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const OG_CHAIN = {
  id: 10744,
  name: "OpenGradient",
  nativeCurrency: { name: "OG", symbol: "OG", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.opengradient.ai"] } },
};

export async function createOGClient(privateKey) {
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: OG_CHAIN,
    transport: http(),
  });
  return wrapFetch(fetch, {
    schemes: [
      { network: "eip155:10744", client: new ExactEvmScheme(walletClient) },
    ],
  });
}

export async function extractTasks(x402Fetch, pageContent) {
  const response = await x402Fetch(
    "https://llmogevm.opengradient.ai/v1/chat/completions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o",
        messages: [
          {
            role: "system",
            content: "Extract actionable tasks from the following content. Return JSON array of {title, deadline, priority, source_url}."
          },
          { role: "user", content: pageContent }
        ],
        max_tokens: 1000,
        temperature: 0.3,
      }),
    }
  );
  return response.json();
}
```

### Pattern 2: Message-Passing Hub (Service Worker as Orchestrator)

**What:** The background service worker acts as the single orchestrator. Content scripts and popup never call external APIs directly -- they send messages to the service worker, which handles all API calls, storage, and scheduling.

**When to use:** Always. This is the standard MV3 architecture and enforces clean separation of concerns.

**Trade-offs:**
- Pro: Content scripts stay minimal (security-critical since they run in page context)
- Pro: Single point for API key management and error handling
- Pro: Popup loads instantly from local storage, doesn't wait for API calls
- Con: All communication is async message-passing (slightly more boilerplate)
- Con: Service worker may be terminated after 5 minutes of inactivity; must handle reconnection

**Example:**
```javascript
// content/content-script.js
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === "E") {
    const pageContent = document.body.innerText;
    chrome.runtime.sendMessage({
      type: "EXTRACT_TASKS",
      payload: {
        content: pageContent.substring(0, 8000), // limit payload size
        url: window.location.href,
        title: document.title,
      },
    });
  }
});

// background/service-worker.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EXTRACT_TASKS") {
    handleTaskExtraction(message.payload)
      .then((tasks) => sendResponse({ success: true, tasks }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // keep message channel open for async response
  }
});
```

### Pattern 3: Dual Storage (Local Cache + Cloud Sync via MemSync)

**What:** Use `chrome.storage.local` as the primary fast-access store and MemSync as the durable cloud memory layer. Write to local first (optimistic), then sync to MemSync in the background.

**When to use:** For all task data. Local storage ensures instant popup rendering. MemSync provides cross-device persistence and semantic search.

**Trade-offs:**
- Pro: Popup loads instantly from local cache
- Pro: Works offline (tasks stored locally even if MemSync is unreachable)
- Pro: MemSync semantic search enables "find tasks about X" queries
- Con: Must handle sync conflicts (local vs. cloud)
- Con: Two sources of truth require reconciliation logic

**Example:**
```javascript
// background/tasks/store.js
async function saveTask(task) {
  // 1. Write to local storage immediately
  const { tasks = [] } = await chrome.storage.local.get("tasks");
  tasks.push({ ...task, syncStatus: "pending" });
  await chrome.storage.local.set({ tasks });

  // 2. Sync to MemSync in background
  try {
    await memsyncClient.storeMemory({
      messages: [{ role: "assistant", content: JSON.stringify(task) }],
      agent_id: "task-extractor",
      source: "browser-extension",
    });
    // Mark as synced
    task.syncStatus = "synced";
    await chrome.storage.local.set({ tasks });
  } catch (err) {
    console.warn("MemSync sync deferred:", err.message);
    // Will retry on next alarm cycle
  }
}
```

## Data Flow

### Primary Flow: Webpage to Task Notification

```
[1] User visits webpage
         |
[2] Content Script extracts page text (user-triggered or automatic)
         |
[3] chrome.runtime.sendMessage({ type: "EXTRACT_TASKS", payload: { content, url } })
         |
[4] Service Worker receives message
         |
[5] Service Worker calls OpenGradient x402 Gateway
    POST https://llmogevm.opengradient.ai/v1/chat/completions
    (LLM extracts structured tasks from raw text)
         |
[6] Service Worker parses LLM response into task objects
         |
[7] Tasks saved to chrome.storage.local (immediate)
         |
[8] Tasks synced to MemSync API (background)
    POST https://api.memchat.io/v1/memories
         |
[9] chrome.alarms.create() for each task with a deadline
         |
[10] When alarm fires: chrome.notifications.create() shows reminder
         |
[11] User clicks notification or opens popup to view/manage tasks
```

### Secondary Flow: Popup Task Display

```
[1] User clicks extension icon
         |
[2] Popup opens, reads chrome.storage.local synchronously
         |
[3] Tasks rendered immediately from local cache
         |
[4] (Optional) Popup sends "REFRESH" message to service worker
         |
[5] Service worker queries MemSync for any cross-device updates
    POST https://api.memchat.io/v1/memories/search
         |
[6] Merged results update chrome.storage.local
         |
[7] Popup re-renders with fresh data
```

### Key Data Flows

1. **Content Extraction:** User triggers extraction (hotkey or context menu) -> content script reads DOM -> sends truncated text to service worker. Keep payload under 8KB to avoid message size limits.

2. **AI Task Parsing:** Service worker constructs a system prompt instructing the LLM to return structured JSON -> calls x402 gateway -> parses response -> validates task schema before storage.

3. **Memory Persistence:** Tasks written to `chrome.storage.local` first (optimistic), then async-synced to MemSync. A periodic alarm (every 5 minutes) retries any failed syncs.

4. **Reminder Delivery:** Each task with a deadline gets a `chrome.alarm`. When it fires, the service worker wakes, reads the task from local storage, and creates a `chrome.notification`. Alarms must be re-registered on service worker startup since they may not survive browser restarts.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 user, <100 tasks | Current architecture is sufficient. `chrome.storage.local` has a 10MB limit (or unlimited with `unlimitedStorage` permission). |
| 1 user, 1000+ tasks | Implement pagination in popup. Add indexing logic in local storage (task lists by date/status). MemSync semantic search becomes valuable for finding old tasks. |
| Multi-device | MemSync already handles cross-device sync. Add a "last sync timestamp" per device. On popup open, query MemSync for changes since last sync. |
| Cost management | OpenGradient x402 charges per inference. Batch page content when possible. Cache extraction results for recently-visited URLs to avoid re-processing. |

### Scaling Priorities

1. **First bottleneck: API latency.** LLM inference takes 2-10 seconds. The popup must never wait for it. Solution: always render from local cache, update async.
2. **Second bottleneck: Token costs.** Long pages consume many tokens. Solution: extract only relevant sections (article body, not navigation/ads), truncate to ~4000 tokens, use `temperature: 0.3` for deterministic outputs.

## Anti-Patterns

### Anti-Pattern 1: Running a Local Python Server

**What people do:** Spin up a Flask/FastAPI server locally to wrap the OpenGradient Python SDK, then call it from the extension via `localhost` requests.

**Why it's wrong:** Requires users to install Python, run a server process, keep it running, and manage a separate dependency. Fragile, not distributable via Chrome Web Store, and creates a confusing user experience. Also blocked by CORS and mixed-content policies in many configurations.

**Do this instead:** Use the x402 HTTP gateway directly from JavaScript. The `@x402/fetch` library handles the payment protocol automatically. The x402 gateway provides the same TEE-verified inference as the Python SDK. This was confirmed in OpenGradient's documentation: "x402 works with JavaScript, Go, Rust, Python, curl, and any HTTP client."

### Anti-Pattern 2: Calling External APIs from Content Scripts

**What people do:** Import API clients into content scripts and call OpenGradient or MemSync directly from page context.

**Why it's wrong:** Content scripts run in the context of web pages. API keys would be exposed to the page's JavaScript. CORS restrictions will block most external API calls from content script context. Violates principle of least privilege.

**Do this instead:** Content scripts extract text only. All API calls go through the background service worker via `chrome.runtime.sendMessage`. The service worker holds API keys securely and has unrestricted `fetch` access.

### Anti-Pattern 3: Persistent Background Connections

**What people do:** Establish WebSocket connections or long-polling from the service worker to external APIs.

**Why it's wrong:** MV3 service workers terminate after ~5 minutes of inactivity. Persistent connections will be dropped. Reconnection logic adds complexity and unreliability.

**Do this instead:** Use event-driven patterns. `chrome.alarms` for periodic checks. `chrome.runtime.onMessage` for on-demand operations. Each operation should be a short-lived `fetch` call that completes before the service worker sleeps.

### Anti-Pattern 4: Storing Secrets in chrome.storage.sync

**What people do:** Save wallet private keys and API keys in `chrome.storage.sync` for cross-device access.

**Why it's wrong:** `chrome.storage.sync` syncs to Google's servers. Private keys stored there are at risk. Also, sync storage has a 100KB total limit.

**Do this instead:** Store secrets in `chrome.storage.local` only. If cross-device key sharing is needed, require the user to re-enter credentials on each device. Consider using `chrome.storage.session` (in-memory, cleared on browser close) for the most sensitive keys.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **OpenGradient x402 Gateway** | HTTP POST to `/v1/chat/completions` via `@x402/fetch` wrapper. Requires wallet private key for EIP-712 payment signing. | Production endpoint: `https://llmogevm.opengradient.ai`. Supports GPT-4o, Claude, Gemini, Grok models. Response format is OpenAI-compatible. |
| **MemSync REST API** | Standard HTTP with `X-API-Key` header. Three core endpoints: store (`POST /memories`), search (`POST /memories/search`), profile (`GET /users/profile`). | Base URL: `https://api.memchat.io/v1`. API key auth (OAuth 2.0 coming). Automatic memory extraction and classification into semantic/episodic types. |
| **OpenGradient Blockchain** | Indirect via x402. Payment transactions settle on Chain ID 10744. Wallet needs OUSDC tokens at `0x48515A4b24f17cadcD6109a9D85a57ba55a619a6`. | Users need a MetaMask-compatible wallet. Testnet faucet available for development. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Content Script <-> Service Worker | `chrome.runtime.sendMessage` (one-shot) or `chrome.runtime.connect` (long-lived port) | One-shot for task extraction requests. Long-lived port only if streaming extraction feedback to page. Messages are JSON-serializable only. |
| Popup <-> Service Worker | `chrome.runtime.sendMessage` for commands. `chrome.storage.onChanged` listener for reactive updates. | Popup reads local storage directly on open. Sends action messages (complete task, snooze, delete) to service worker. |
| Service Worker <-> chrome.storage | `chrome.storage.local.get/set` async API | All reads/writes are async. Batch operations when possible (`set({tasks, lastSync, settings})` in one call). |
| Service Worker <-> Alarms | `chrome.alarms.create/get/clear` + `chrome.alarms.onAlarm` listener | Re-register alarms on service worker startup. Minimum period: 30 seconds. Name alarms with task IDs for easy mapping. |

## Build Order (Suggested Dependency Chain)

Components should be built in this order based on dependencies:

```
Phase 1: Extension Skeleton + Content Script
  |- manifest.json (MV3 config, permissions)
  |- content-script.js (DOM text extraction)
  |- service-worker.js (message listener stub)
  |- popup.html/js (static task list shell)

Phase 2: AI Task Extraction (OpenGradient)
  |- opengradient.js (x402 client, @x402/fetch setup)
  |- extractor.js (prompt engineering, response parsing)
  |- Wire content script -> service worker -> x402 gateway

Phase 3: Local Storage + Task Management
  |- store.js (chrome.storage.local CRUD)
  |- popup.js (dynamic task rendering from local store)
  |- Task lifecycle: create, complete, delete, snooze

Phase 4: Reminders + Notifications
  |- scheduler.js (chrome.alarms for deadlines)
  |- Notification creation on alarm fire
  |- Alarm re-registration on service worker wake

Phase 5: MemSync Cloud Persistence
  |- memsync.js (REST client for store/search/profile)
  |- Dual-write logic (local first, cloud second)
  |- Periodic sync via chrome.alarms
  |- Semantic search in popup ("find tasks about...")

Phase 6: Polish + Settings
  |- options.html/js (API key config, preferences)
  |- Error handling, retry logic, offline mode
  |- Badge count on extension icon
```

**Build order rationale:**
- Phase 1 first because everything depends on the extension skeleton and message-passing infrastructure.
- Phase 2 before Phase 3 because you need AI output to have tasks to store. But you can hard-code sample tasks for Phase 3 development if preferred.
- Phase 4 depends on Phase 3 (need stored tasks with deadlines to schedule alarms for).
- Phase 5 is intentionally late -- local-only operation should work completely before adding cloud sync complexity.
- Phase 6 is last because hard-coded API keys work for development; settings UI is polish.

## Python/JavaScript Integration Strategy: Decision

**Recommendation: Do NOT use the Python SDK. Use the x402 HTTP gateway exclusively.**

**Confidence: HIGH** -- verified against OpenGradient's official documentation.

| Approach | Verdict | Reason |
|----------|---------|--------|
| Local Python server (Flask/FastAPI) wrapping Python SDK | REJECT | Requires Python installation, running server, not distributable, fragile |
| Pyodide (Python-in-browser via WASM) | REJECT | 15MB+ download, slow startup, overkill for HTTP API calls |
| JSPyBridge (Node.js <-> Python interop) | REJECT | Requires Node.js runtime, not available in browser extension context |
| Cloud function wrapping Python SDK | POSSIBLE but unnecessary | Adds hosting cost and latency for no benefit over x402 |
| **x402 HTTP Gateway (direct from JS)** | **USE THIS** | Native JavaScript, `@x402/fetch` handles payment protocol, OpenAI-compatible API, same TEE verification as Python SDK |

The x402 gateway is OpenGradient's official HTTP interface. It exposes the same `/v1/chat/completions` endpoint with the same models and TEE verification. The `@x402/fetch` npm package and `@x402/evm` handle the payment signing automatically using `viem` (a lightweight Ethereum library). This means the entire extension can be pure JavaScript/TypeScript with no Python dependency.

MemSync is already a REST API (`https://api.memchat.io/v1`) with simple API key authentication, so it requires no bridge at all -- standard `fetch()` calls work directly.

## Sources

- [Chrome Manifest V3 Migration Overview](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3) -- HIGH confidence
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) -- HIGH confidence
- [Chrome Alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms) -- HIGH confidence
- [OpenGradient SDK GitHub](https://github.com/OpenGradient/sdk) -- HIGH confidence
- [OpenGradient x402 Gateway Docs](https://docs.opengradient.ai/developers/x402/) -- HIGH confidence
- [OpenGradient x402 API Reference](https://docs.opengradient.ai/developers/x402/api-reference) -- HIGH confidence
- [OpenGradient x402 Examples (TypeScript)](https://docs.opengradient.ai/developers/x402/examples) -- HIGH confidence
- [MemSync Overview](https://docs.opengradient.ai/developers/memsync/) -- HIGH confidence
- [MemSync API Docs](https://api.memchat.io/docs) -- MEDIUM confidence (Swagger UI, limited detail extracted)
- [Chrome Extension + FastAPI Architecture Example](https://medium.com/@dineshramdsml/building-an-ai-powered-code-explanation-bot-as-a-chrome-extension-with-fastapi-c18c998e8e8e) -- MEDIUM confidence (used as counter-example)
- [x402 Protocol Standard](https://www.x402.org/ecosystem) -- MEDIUM confidence
- [WebextLLM (browser extension LLM example)](https://github.com/idosal/WebextLLM) -- LOW confidence (reference only)
- [Chrome Extension Deep Dive: Lifecycle to Dataflow](https://sriniously.xyz/blog/chrome-extension) -- MEDIUM confidence

---
*Architecture research for: Chrome Extension with AI/LLM Backend (OpenGradient + MemSync)*
*Researched: 2026-02-14*

# Stack Research

**Domain:** AI-powered Chrome browser extension with OpenGradient TEE LLM inference + MemSync persistent memory
**Researched:** 2026-02-14
**Confidence:** MEDIUM (core extension stack is HIGH; OpenGradient x402 integration from browser is LOW -- novel pattern, limited community precedent)

---

## Critical Integration Decision: Python SDK vs x402 Gateway

The single most important architectural decision for this project is **how the Chrome extension (JavaScript) calls OpenGradient's AI infrastructure (Python SDK)**.

### Option A: Python Backend Microservice (REJECTED for MVP)
Run a Python FastAPI server that wraps the OpenGradient SDK, expose REST endpoints, call from the extension.
- **Why not:** Adds deployment complexity, hosting costs, latency, and a SPOF. The 5-7 day MVP timeline cannot absorb backend infrastructure setup.

### Option B: x402 Gateway -- Direct from JavaScript (RECOMMENDED)
OpenGradient exposes an **x402 Gateway** that works over standard HTTP/REST. Any language can call it -- no Python required. The `@x402/fetch` npm package wraps the native `fetch()` API to automatically handle 402 Payment Required responses with cryptographic payment signing.

- **Confidence:** MEDIUM -- the x402 Gateway is documented as supporting "JavaScript, Go, Rust, curl" with "universal language support," and the `@x402/fetch` package (v2.1.0, published Feb 2026) provides production-ready TypeScript wrappers. However, calling OpenGradient's specific LLM endpoints via x402 from a browser extension service worker is a novel pattern with no community examples found.
- **Why this works:** The extension's service worker can use `@x402/fetch` + `@x402/evm` to make payment-signed HTTP requests directly to OpenGradient's TEE LLM inference endpoints, bypassing the Python SDK entirely.
- **Risk mitigation:** If x402 Gateway lacks a specific feature available only in the Python SDK, fall back to a lightweight Python proxy (FastAPI on Railway/Render) for that single endpoint.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| **WXT** | 0.20.17 | Browser extension framework | Market leader for 2026. Framework-agnostic, Vite-powered, best HMR, auto-generates manifest from file structure, handles MV2/MV3 cross-browser from single codebase. Actively maintained (224+ releases, 9.2k stars). Plasmo has maintenance concerns; CRXJS has uncertain long-term commitment. | HIGH |
| **React** | 18.x | UI framework for popup/options/sidepanel | Largest ecosystem, most extension examples, WXT has first-class support via `@wxt-dev/module-react`. Team likely already knows React. | HIGH |
| **TypeScript** | 5.x | Type safety | Non-negotiable for extension development -- catches manifest permission errors, API type mismatches, and message-passing bugs at compile time. WXT is TypeScript-first. | HIGH |
| **Tailwind CSS** | 4.x | Styling | CSS-first config (no tailwind.config.js needed), 5x faster builds via Lightning CSS engine, one-line import (`@import "tailwindcss"`). Chrome 111+ support covers all MV3 browsers. Perfect for extension UIs where you want small CSS bundles with no runtime. | HIGH |
| **@x402/fetch** | 2.1.0 | x402 payment-gated HTTP client | Wraps native `fetch()` to auto-handle 402 Payment Required responses. Required to call OpenGradient's x402 Gateway directly from JavaScript without the Python SDK. | MEDIUM |
| **@x402/evm** | latest | EVM payment scheme for x402 | Registers the EVM signing scheme so `@x402/fetch` can create cryptographic payment proofs using a wallet private key. Required alongside `@x402/fetch`. | MEDIUM |
| **viem** | latest | Ethereum utilities | Used by `@x402/evm` for `privateKeyToAccount()`. Lightweight alternative to ethers.js, tree-shakable, TypeScript-first. | MEDIUM |

### OpenGradient Integration Layer

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| **OpenGradient x402 Gateway** | N/A (HTTP API) | TEE-verified LLM inference | Provides HTTP/REST access to OpenGradient's Claude 4.0 Sonnet model with TEE verification, accessible from any language including JavaScript. No Python required. Supports `anthropic/claude-4.0-sonnet` (TEE_LLM.CLAUDE_4_0_SONNET). | MEDIUM |
| **OpenGradient Python SDK** | 0.6.1 | Backend fallback only | `pip install opengradient`. Python >=3.11. Use ONLY if x402 Gateway is missing a needed feature. Not for primary integration path. | HIGH (for the SDK itself) |

**Available Models via OpenGradient (all TEE-verified):**
- `anthropic/claude-4.0-sonnet` -- PRIMARY (project requirement)
- `anthropic/claude-3.5-haiku` -- cheaper fallback for simple extractions
- `openai/gpt-4.1`, `openai/gpt-4o`
- `google/gemini-2.5-flash-preview`, `google/gemini-2.5-pro`
- `x-ai/grok-3-beta`

**Settlement Modes:**
- `SETTLE` -- records only cryptographic hashes (cheapest, default)
- `SETTLE_METADATA` -- stores full input/output data (for audit trails)
- `SETTLE_BATCH` -- aggregates multiple inferences (cost optimization for high-volume)

### MemSync Integration Layer

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| **MemSync REST API** | v1 | Persistent AI memory storage | REST API at `api.memchat.io` with comprehensive endpoints for memory CRUD, semantic search, user profiles, and fact extraction. HTTPBearer auth. No SDK needed -- plain `fetch()` calls work. | HIGH |

**Key MemSync Endpoints for This Project:**

| Endpoint | Method | Purpose in Task Assistant |
|----------|--------|---------------------------|
| `POST /v1/memories` | POST | Store extracted action items with context |
| `POST /v1/memories/search` | POST | Semantic search for related tasks/context |
| `GET /v1/memories` | GET | List stored memories (paginated) |
| `PUT /v1/memories/{id}` | PUT | Update task status |
| `DELETE /v1/memories/{id}` | DELETE | Remove completed/cancelled tasks |
| `GET /v1/users/bio` | GET | Get user profile for personalization |
| `POST /v1/api-keys` | POST | Generate API keys for the extension |

**Auth:** HTTPBearer token + `X-API-Key` header + `x-app-name` + `x-user-id` headers.

### Chrome Extension APIs

| API | Purpose | Notes | Confidence |
|-----|---------|-------|------------|
| **chrome.notifications** | Show task extraction alerts | Basic notification API, well-documented. Use `chrome.notifications.create()` with type "basic". | HIGH |
| **chrome.storage.local** | Cache tasks locally | Replaces `localStorage` (unavailable in service workers). Use for offline-first task cache before syncing to MemSync. | HIGH |
| **chrome.tabs / chrome.activeTab** | Read current page URL/title | `activeTab` permission grants temporary access on user click -- less scary than broad `tabs` permission. | HIGH |
| **chrome.scripting** | Inject content scripts | MV3 replacement for `chrome.tabs.executeScript()`. Use for on-demand page content extraction. | HIGH |
| **chrome.alarms** | Periodic sync / reminders | Replaces `setInterval()` which dies when service worker terminates (~5 min inactivity). Minimum interval: 1 minute. | HIGH |
| **chrome.sidePanel** | Task list sidebar UI | Modern Chrome API for persistent side panel. Better UX than popup for task management. Available Chrome 114+. | HIGH |
| **chrome.runtime.onMessage** | Content script <-> Service worker messaging | Standard MV3 message passing. Use for sending extracted page content to service worker for LLM processing. | HIGH |
| **chrome.contextMenus** | Right-click "Extract tasks" | Low-friction way for users to trigger task extraction on selected text. | HIGH |

### Supporting Libraries

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| **@radix-ui/react-** | latest | Accessible UI primitives | For popup/sidepanel UI components (dialogs, checkboxes, dropdown menus). Use with Tailwind for styling. | HIGH |
| **clsx + tailwind-merge** | latest | Conditional CSS classes | Utility for composing Tailwind class names without conflicts. Standard pattern with Tailwind. | HIGH |
| **zod** | 3.x | Runtime validation | Validate LLM responses (structured output parsing), MemSync API responses, and message payloads between content script and service worker. | HIGH |
| **date-fns** | 4.x | Date manipulation | Task due dates, relative time display ("2 hours ago"). Tree-shakable unlike moment.js. | MEDIUM |

### Development Tools

| Tool | Purpose | Notes | Confidence |
|------|---------|-------|------------|
| **pnpm** | Package manager | Fastest installs, strictest dependency resolution, saves disk space. WXT examples use pnpm. | HIGH |
| **Vitest** | Unit testing | Same Vite config as WXT, zero-config for TypeScript, fast watch mode. | HIGH |
| **ESLint + Prettier** | Code quality | Use `eslint-plugin-react-hooks` for React, `@typescript-eslint/parser` for TS. | HIGH |
| **Chrome DevTools** | Extension debugging | F12 on the extension popup, inspect service worker in chrome://extensions. WXT auto-opens DevTools in dev mode. | HIGH |

---

## Installation

```bash
# Bootstrap project
pnpm dlx wxt@latest init my-task-assistant --template react

# Core extension dependencies
pnpm add react react-dom

# OpenGradient x402 integration (direct from extension, no Python needed)
pnpm add @x402/fetch @x402/evm viem

# UI
pnpm add @radix-ui/react-checkbox @radix-ui/react-dialog @radix-ui/react-dropdown-menu
pnpm add clsx tailwind-merge

# Utilities
pnpm add zod date-fns

# Dev dependencies
pnpm add -D typescript @types/react @types/react-dom @types/chrome
pnpm add -D tailwindcss postcss autoprefixer
pnpm add -D vitest @vitest/ui
pnpm add -D eslint prettier eslint-plugin-react-hooks @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

### WXT Configuration

```typescript
// wxt.config.ts
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'AI Task Assistant',
    permissions: [
      'activeTab',
      'storage',
      'notifications',
      'alarms',
      'sidePanel',
      'contextMenus',
      'scripting',
    ],
    host_permissions: [
      'https://api.memchat.io/*',  // MemSync API
      // OpenGradient x402 endpoint (verify actual domain)
    ],
  },
});
```

### x402 Client Setup (Service Worker)

```typescript
// lib/opengradient.ts
import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

const client = new x402Client();
registerExactEvmScheme(client, {
  signer: privateKeyToAccount(
    process.env.OG_PRIVATE_KEY as `0x${string}`
  ),
});

export const ogFetch = wrapFetchWithPayment(fetch, client);

// Usage: call OpenGradient LLM with TEE verification
export async function extractTasks(pageContent: string): Promise<string> {
  const response = await ogFetch('https://<opengradient-x402-endpoint>/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'anthropic/claude-4.0-sonnet',
      messages: [
        { role: 'system', content: 'Extract action items from the following content. Return as JSON array.' },
        { role: 'user', content: pageContent },
      ],
      max_tokens: 500,
      temperature: 0.0,
    }),
  });
  return response.json();
}
```

### MemSync Client Setup

```typescript
// lib/memsync.ts
const MEMSYNC_BASE = 'https://api.memchat.io';

async function memsyncFetch(path: string, options: RequestInit = {}) {
  const apiKey = await chrome.storage.local.get('memsync_api_key');
  return fetch(`${MEMSYNC_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey.memsync_api_key}`,
      'X-API-Key': apiKey.memsync_api_key,
      'x-app-name': 'ai-task-assistant',
      'x-user-id': await getUserId(),
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

export async function storeTask(task: Task) {
  return memsyncFetch('/v1/memories', {
    method: 'POST',
    body: JSON.stringify({
      messages: [{ role: 'assistant', content: JSON.stringify(task) }],
      app_name_id: 'ai-task-assistant',
      user_id: await getUserId(),
      source: 'chrome-extension',
    }),
  });
}

export async function searchTasks(query: string) {
  return memsyncFetch('/v1/memories/search', {
    method: 'POST',
    body: JSON.stringify({
      query,
      limit: 20,
      categories: ['tasks'],
    }),
  });
}
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| **WXT** | Plasmo | Plasmo has higher GitHub stars but **maintenance concerns** -- stalling development trajectory is a real risk for new projects. WXT has superior HMR, smaller bundles, and more active maintenance. |
| **WXT** | CRXJS (Vite Plugin) | CRXJS went through a rocky period with maintainer transition. December 2025 release shows revival, but **long-term commitment remains uncertain**. WXT is the safer bet. |
| **WXT** | Raw Vite + manual manifest | WXT handles manifest generation, cross-browser compat, HMR for service workers, and content script injection. Manual setup wastes 1-2 days of the 5-7 day MVP window. |
| **x402 Gateway** | Python backend (FastAPI) | Adds infrastructure complexity (hosting, deployment, monitoring). The 5-7 day timeline cannot absorb this. x402 Gateway eliminates the need for a Python intermediary. |
| **x402 Gateway** | OpenGradient Python SDK directly | Python SDK cannot run in a browser extension. Would require a backend server, which we're avoiding for MVP. |
| **React** | Vue / Svelte | React has the largest extension development ecosystem and most examples. Vue/Svelte are viable but offer less community support for extension-specific patterns. |
| **Tailwind CSS v4** | Tailwind v3 | v4 is production-ready (Jan 2025 release), 5x faster builds, simpler config. No reason to use v3 for new projects. |
| **Tailwind CSS** | CSS Modules / Styled Components | Extensions need style isolation from host pages (content scripts). Tailwind + Shadow DOM is the proven pattern. CSS-in-JS adds runtime overhead in extension contexts. |
| **MemSync** | Chrome storage only | Chrome storage lacks semantic search, fact extraction, and cross-device persistence. MemSync provides AI-native memory that travels across apps. Project requirement specifies MemSync. |
| **MemSync** | Mem0 | Mem0 is a competitor with similar API surface, but project explicitly requires MemSync (OpenGradient ecosystem). |
| **Radix UI** | shadcn/ui | shadcn/ui is built on Radix. For a 5-7 day MVP, using Radix primitives directly is faster than copying shadcn component files. Can upgrade to shadcn later. |
| **pnpm** | npm / yarn | pnpm is fastest, strictest, and what WXT examples use. npm v10+ is acceptable but slower. Avoid Yarn -- no clear advantage for extension projects. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Manifest V2** | Completely unsupported across all major browsers as of June 2025. Chrome Web Store rejects MV2 submissions. | Manifest V3 (WXT handles this automatically) |
| **Background pages** | MV2 concept. Replaced by service workers in MV3. Service workers terminate after ~5 min of inactivity -- background pages assumed persistence that no longer exists. | Service workers with `chrome.alarms` for periodic work |
| **window.localStorage** | Unavailable in service workers. Will throw `ReferenceError`. | `chrome.storage.local` (async, works everywhere in extension) |
| **setTimeout / setInterval** | Cancelled when service worker terminates. Timers silently fail. | `chrome.alarms` API (minimum 1-minute interval) |
| **ethers.js** | Larger bundle, less tree-shakable than viem. x402 examples use viem. | `viem` for Ethereum wallet operations |
| **Webpack** | Slower builds, more config than Vite. WXT is Vite-native. | WXT (Vite under the hood) |
| **moment.js** | 300KB+ bundle, not tree-shakable. Overkill for date formatting. | `date-fns` (tree-shakable, smaller) |
| **axios** | Unnecessary dependency when `@x402/fetch` already wraps native `fetch()`. Adding axios creates two HTTP client patterns. | Native `fetch()` or `@x402/fetch` |
| **Redux / Zustand** | Over-engineered for extension state. Extension state lives in `chrome.storage` and is inherently async. Adding a state manager creates sync conflicts. | `chrome.storage.local` + React Context for UI state |
| **Next.js / Remix** | Server-side frameworks. Extensions are client-side. These frameworks add massive bundle size and SSR machinery that cannot run in an extension. | WXT + React (client-side only) |
| **Plasmo CSUI** | Plasmo's Content Script UI is its best feature, but ties you to Plasmo's ecosystem which has maintenance risks. | WXT content scripts + React portals into Shadow DOM |

---

## Stack Patterns by Variant

**If x402 Gateway works for OpenGradient LLM calls (expected path):**
- Use `@x402/fetch` directly from the service worker
- No backend needed. Fully client-side architecture.
- Because: Simplest architecture, fastest MVP, no infrastructure costs

**If x402 Gateway is missing needed OpenGradient features:**
- Deploy a thin Python FastAPI proxy on Railway ($5/month) or Render (free tier)
- Proxy wraps `opengradient` Python SDK (v0.6.1) and exposes REST endpoints
- Extension calls proxy instead of x402 Gateway
- Because: Fallback that preserves full SDK access while keeping extension simple

**If you need offline-first capability:**
- Add `chrome.storage.local` as primary task cache
- Sync to MemSync when online using `chrome.alarms` periodic check
- Because: Extensions should work even when APIs are temporarily unreachable

**If you need to support Firefox:**
- WXT handles MV2/MV3 differences automatically
- Replace `chrome.sidePanel` with `browser.sidebarAction` (Firefox equivalent)
- Because: WXT's cross-browser support is its strongest feature

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| WXT 0.20.x | React 18.x, React 19.x | WXT module-react v1.1.5 supports both |
| WXT 0.20.x | Tailwind CSS 4.x | Via Vite PostCSS integration, zero-config |
| WXT 0.20.x | TypeScript 5.x | TypeScript-first framework |
| @x402/fetch 2.1.0 | @x402/evm latest | Must be installed together for EVM payment signing |
| @x402/evm | viem latest | Uses viem for `privateKeyToAccount()` |
| opengradient 0.6.1 | Python >=3.11 | Only if using Python fallback proxy |
| Tailwind CSS 4.x | Chrome 111+ | Lightning CSS engine targets modern browsers only |
| Chrome sidePanel API | Chrome 114+ | Not available in older Chrome versions |

---

## Open Questions / Risks

1. **x402 Gateway endpoint URL for OpenGradient LLM inference:** The exact HTTP endpoint to call Claude 4.0 Sonnet via x402 is not documented in public-facing docs. The Python SDK uses `og_llm_server_url` internally but this URL is not published. **Action:** Check OpenGradient Discord/docs for the x402-compatible LLM endpoint, or use the Python SDK's default `https://sdk-devnet.opengradient.ai` as the base URL. **Confidence: LOW.**

2. **Wallet private key in browser extension:** Storing an EVM private key (`OG_PRIVATE_KEY`) in a browser extension is a security concern. The key is needed for x402 payment signing. **Mitigation:** Use `chrome.storage.local` with encryption, or prompt user to enter/import key at setup. Do NOT hardcode in source. **Confidence: MEDIUM.**

3. **Service worker + x402 fetch compatibility:** The `@x402/fetch` package wraps native `fetch()` which is available in service workers. Should work, but this specific combination (MV3 service worker + x402 payment flow) has no documented community usage. **Confidence: LOW.**

4. **MemSync API rate limits:** The API has a `/v1/users/rate-limits` endpoint suggesting rate limiting exists, but limits are not documented publicly. Could be a blocker at scale. **Confidence: LOW.**

5. **MemSync auth flow for extension users:** How does a new user get a MemSync API key/bearer token? The API has `POST /v1/api-keys` but the initial auth flow (likely OAuth or MemSync account creation) is unclear from public docs. **Action:** Check MemSync Chrome extension's auth flow as a reference implementation. **Confidence: LOW.**

---

## Sources

- [Chrome Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3) -- MV3 architecture (HIGH confidence)
- [WXT Framework](https://wxt.dev/) -- v0.20.17 confirmed from GitHub (HIGH confidence)
- [WXT GitHub](https://github.com/wxt-dev/wxt) -- Version, stars, activity verified (HIGH confidence)
- [@wxt-dev/module-react on npm](https://www.npmjs.com/package/@wxt-dev/module-react) -- v1.1.5 confirmed (HIGH confidence)
- [OpenGradient LLM Docs](https://docs.opengradient.ai/developers/sdk/llm.html) -- SDK API, models, TEE modes (HIGH confidence)
- [OpenGradient Python SDK API Reference](https://docs.opengradient.ai/api_reference/python_sdk/) -- Client class, enums (HIGH confidence)
- [OpenGradient PyPI](https://pypi.org/project/opengradient/) -- v0.6.1, Python >=3.11 (HIGH confidence)
- [OpenGradient Developers Overview](https://docs.opengradient.ai/developers/) -- x402 Gateway, MemSync, SDK overview (HIGH confidence)
- [MemSync API (Swagger)](https://api.memchat.io/docs) -- Full OpenAPI spec with all endpoints (HIGH confidence)
- [MemSync Launch PR](https://www.prnewswire.com/news-releases/opengradient-launches-memsync-universal-memory-layer-for-ai-assistants-302560572.html) -- Product overview (MEDIUM confidence)
- [MemSync Developer Docs](https://memsync.mintlify.app/) -- Guide structure confirmed (MEDIUM confidence)
- [x402 Protocol](https://www.x402.org/ecosystem) -- Payment standard overview (HIGH confidence)
- [x402 Coinbase GitHub](https://github.com/coinbase/x402) -- TypeScript client examples (HIGH confidence)
- [x402 Buyer Quickstart](https://docs.cdp.coinbase.com/x402/quickstart-for-buyers) -- Fetch/Axios client code (HIGH confidence)
- [@x402/fetch on npm](https://www.npmjs.com/package/@x402/fetch) -- v2.1.0 confirmed (MEDIUM confidence)
- [Tailwind CSS v4 Guide](https://devtoolbox.dedyn.io/blog/tailwind-css-v4-complete-guide) -- v4 features, compatibility (MEDIUM confidence)
- [Chrome Extension Frameworks Comparison 2025](https://www.devkit.best/blog/mdx/chrome-extension-framework-comparison-2025) -- WXT vs Plasmo vs CRXJS (MEDIUM confidence)
- [Top 5 Chrome Extension Frameworks 2026](https://extensionbooster.com/blog/best-chrome-extension-frameworks-compared/) -- WXT market leader status (MEDIUM confidence)
- [Building AI-Powered Extensions with WXT](https://marmelab.com/blog/2025/04/15/browser-extension-form-ai-wxt.html) -- WXT + AI patterns (MEDIUM confidence)
- [Chrome Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) -- 5-min termination, event patterns (HIGH confidence)

---
*Stack research for: AI-powered Chrome task assistant with OpenGradient TEE + MemSync*
*Researched: 2026-02-14*

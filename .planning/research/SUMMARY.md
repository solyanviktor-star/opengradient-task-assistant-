# Project Research Summary

**Project:** OpenGradient Task Assistant
**Domain:** AI-powered Chrome browser extension (OpenGradient TEE + MemSync)
**Researched:** 2026-02-14
**Confidence:** MEDIUM

## Executive Summary

This project is an AI-powered Chrome extension that extracts tasks from web content (Telegram, Gmail, Slack, articles) using OpenGradient's TEE-verified LLM inference and stores them via MemSync persistent memory. The recommended architecture is a pure client-side Manifest V3 extension built with WXT + React + TypeScript, calling OpenGradient's x402 HTTP gateway directly from JavaScript -- no Python backend required. This eliminates the biggest architectural risk (the Python SDK is Python-only, and there is no JS SDK) by using the x402 payment protocol to access the same TEE-verified LLM endpoints over standard HTTP. MemSync is already a REST API and needs only plain `fetch()` calls.

The key competitive angle is genuinely novel: no existing task manager combines AI extraction with cryptographic privacy verification and decentralized memory. The demo should lead with "the first task assistant where you can PROVE your data was processed privately." The 5-7 day timeline is tight but achievable if the team validates the x402 gateway integration in the first 1-2 days (the highest-risk spike) and defers all non-essential features ruthlessly.

The primary risks are: (1) the x402 gateway + MV3 service worker combination is a novel, untested pattern with no community precedent -- if it fails, a Python FastAPI proxy fallback adds 1-2 days; (2) MV3 service worker termination kills long-running AI calls unless mitigated with offscreen documents or keep-alive patterns from day one; (3) wallet private key management in a browser extension requires careful security design, especially for a crypto-savvy audience who will inspect the source. All three risks must be addressed in Phase 1, not deferred.

## Key Findings

### Recommended Stack

The stack is a pure JavaScript/TypeScript client-side architecture using WXT as the extension framework. The critical insight is that OpenGradient's x402 HTTP gateway eliminates the need for a Python backend -- `@x402/fetch` wraps native `fetch()` to handle 402 payment-gated requests with cryptographic signing. MemSync at `api.memchat.io` is a standard REST API with bearer token auth. No SDKs or backend servers are needed for either integration.

**Core technologies:**
- **WXT 0.20.17**: Extension framework -- market leader, Vite-powered, best HMR, auto-generates MV3 manifest (HIGH confidence)
- **React 18.x + TypeScript 5.x**: UI + type safety -- largest extension ecosystem, catches message-passing bugs at compile time (HIGH confidence)
- **@x402/fetch + @x402/evm + viem**: OpenGradient payment gateway client -- enables direct JS calls to TEE-verified LLM without Python (MEDIUM confidence)
- **Tailwind CSS 4.x**: Styling -- 5x faster builds, small bundles, works with Shadow DOM for content script isolation (HIGH confidence)
- **Radix UI primitives**: Accessible popup/sidepanel components (HIGH confidence)
- **zod**: Runtime validation of LLM responses and API payloads (HIGH confidence)

**Critical version requirements:**
- Chrome 114+ required for `chrome.sidePanel` API
- Tailwind CSS 4 requires Chrome 111+ (Lightning CSS engine)
- `@x402/fetch` v2.1.0 must be paired with `@x402/evm` for EVM payment signing
- OpenGradient Python SDK 0.6.1 requires Python >=3.11 (only for fallback proxy)

### Expected Features

**Must have (table stakes):**
- Task extraction from web content via OpenGradient LLM -- the core value proposition
- Persistent task storage via MemSync -- tasks survive restarts
- Task list view (popup or side panel) with basic CRUD
- Push notification reminders via `chrome.alarms` + `chrome.notifications`
- Source attribution -- link tasks back to the page they came from

**Should have (differentiators -- these make the demo compelling):**
- TEE-verified inference mode with privacy verification badge -- THE killer demo feature
- On-chain proof display (transaction hash + block explorer link) -- "free" with TEE mode
- Semantic search over tasks via MemSync -- "find that task about the deployment deadline"
- Context-aware extraction for different platforms (Telegram, Gmail)

**Defer (v2+):**
- Calendar integration, multi-user features, browser history indexing, mobile app
- Real-time message monitoring (scope creep, privacy nightmare)
- Multiple AI model selection (contradicts the OpenGradient narrative)
- Detailed analytics and reporting

### Architecture Approach

The architecture follows the standard MV3 pattern: content scripts extract DOM text and relay it to a background service worker via `chrome.runtime.sendMessage`. The service worker acts as the single orchestrator -- it holds API credentials, calls OpenGradient's x402 gateway for LLM inference, writes tasks to `chrome.storage.local` (fast cache) and MemSync (durable cloud store), and manages `chrome.alarms` for reminders. The popup/side panel reads from local storage for instant rendering and sends action commands back to the service worker. No external API calls happen outside the service worker.

**Major components:**
1. **Content Scripts** -- Thin DOM extractors for Telegram Web, Gmail, etc. Extract text, send message, done. Under 100 lines each.
2. **Background Service Worker** -- Central orchestrator: receives content, calls x402 gateway for LLM inference, manages dual storage (local + MemSync), schedules alarms.
3. **Popup/Side Panel UI** -- React app rendering tasks from local cache. Handles CRUD, search, and privacy badge display.
4. **OpenGradient x402 Client** -- `@x402/fetch` wrapper calling `https://llmogevm.opengradient.ai/v1/chat/completions` with EVM payment signing.
5. **MemSync REST Client** -- Standard `fetch()` calls to `api.memchat.io/v1` for memory CRUD and semantic search.
6. **Options Page** -- API key configuration, notification preferences.

### Critical Pitfalls

1. **Service worker termination kills AI calls.** MV3 service workers die after 30s idle, hard-kill after 5min. AI inference easily exceeds this. Mitigation: use offscreen documents (Chrome 114+) for long-running calls, or implement keep-alive pings. Design for resumability from day one.

2. **API keys and wallet private keys exposed in extension package.** Any shipped JS is inspectable. The crypto audience WILL check. Mitigation: never hardcode secrets; use `chrome.storage.session` (in-memory, cleared on close) for demo; encrypt with Web Crypto API for production.

3. **Content scripts leak data to host pages.** Content scripts share DOM with the page. Never render sensitive data into page DOM. Mitigation: content scripts extract-only, all display in popup/side panel, validate message senders.

4. **OpenGradient SDK is Python-only.** No JS SDK exists (listed as "under development" with no date). Mitigation: use x402 HTTP gateway directly. This is already the recommended approach. Spike it in Phase 1 to confirm viability.

5. **Overly broad permissions trigger Web Store rejection and user distrust.** Use `activeTab` not `<all_urls>`, narrow content script matches, `optional_permissions` for non-essential features. The crypto/Web3 audience is security-conscious.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation + OpenGradient Spike
**Rationale:** Everything depends on the extension skeleton and the x402 gateway working. The x402 integration is the highest-risk unknown and must be validated first. If it fails, the team needs time to pivot to a Python proxy.
**Delivers:** Working MV3 extension shell with WXT + React, proven x402 gateway connection making at least one successful LLM call, credential management pattern (chrome.storage.session), minimal permissions manifest.
**Addresses:** Extension shell (table stake), OpenGradient integration decision
**Avoids:** Service worker termination (offscreen doc pattern established), API key exposure (credential management from day 1), permission overreach (locked down manifest), Python SDK gap (x402 spike proves/disproves viability)

### Phase 2: Content Extraction + AI Task Parsing
**Rationale:** With the x402 connection proven, build the actual extraction pipeline. Content scripts are security-sensitive and must be designed as thin extractors from the start.
**Delivers:** Content scripts for 1-2 platforms (Telegram Web priority, plus one more), prompt engineering for structured task extraction, Zod-validated LLM response parsing, end-to-end flow from page content to parsed task objects.
**Uses:** WXT content scripts, @x402/fetch, zod
**Implements:** Content Script component, AI extraction pipeline
**Avoids:** Content script data leakage (extract-only pattern), DOM selector brittleness (try/catch with fallbacks)

### Phase 3: Local Storage + Task UI
**Rationale:** With tasks being extracted, they need to be stored and displayed. Local storage comes before MemSync because the popup must render instantly from cache and work offline.
**Delivers:** `chrome.storage.local` task CRUD, React popup/side panel showing task list, mark complete / delete / manual create, TEE verification badge on extracted tasks, on-chain proof link display.
**Addresses:** Task list view, basic task management, manual task creation, privacy verification badge, on-chain proof display
**Avoids:** Unencrypted storage (use chrome.storage.session for sensitive content, local only for task metadata)

### Phase 4: Reminders + Notifications
**Rationale:** Depends on stored tasks with deadlines existing (Phase 3). Alarms and notifications use the service worker infrastructure from Phase 1.
**Delivers:** `chrome.alarms` scheduling for tasks with deadlines, `chrome.notifications` for reminder delivery, alarm re-registration on service worker wake, "remind me in X" manual trigger.
**Addresses:** Push notification reminders (table stake)
**Avoids:** setTimeout/setInterval (use chrome.alarms exclusively), silent notification failures (error surfaces in UI)

### Phase 5: MemSync Cloud Persistence + Search
**Rationale:** Intentionally late -- local-only should work completely before adding cloud sync complexity. MemSync adds cross-session persistence and semantic search, which are key differentiators but not blocking for basic functionality.
**Delivers:** MemSync REST client, dual-write logic (local first, cloud second), periodic sync via chrome.alarms, semantic search UI in popup, sync status indicators.
**Addresses:** Persistent task storage (MemSync), semantic search, cross-device sync
**Avoids:** MemSync as single point of failure (local cache is primary), unhandled sync conflicts (local wins, last-write-wins for cloud)

### Phase 6: Polish + Settings + Demo Prep
**Rationale:** Last phase is non-functional polish. Hard-coded API keys get replaced with a settings page. Error handling, retry logic, and offline mode make the demo resilient to live failures.
**Delivers:** Options page for API key configuration, comprehensive error handling with user-facing messages, offline/degraded mode, badge count on extension icon, demo script rehearsal.
**Addresses:** All remaining UX pitfalls (loading states, error surfaces, offline mode)
**Avoids:** Demo day failures (every failure mode rehearsed), scope creep (feature freeze at Phase 5)

### Phase Ordering Rationale

- **Phase 1 first** because every other phase depends on the extension shell and message-passing infrastructure. The x402 spike is critical path -- if it fails after day 2, there is still time to pivot to a Python proxy.
- **Phase 2 before Phase 3** because you need AI-extracted tasks to populate the UI. (Though sample tasks can be hardcoded for parallel UI work.)
- **Phase 4 after Phase 3** because alarms need stored tasks with deadlines to schedule against.
- **Phase 5 intentionally late** because MemSync is additive (persistence + search) not foundational. The extension should work fully offline before cloud sync is added.
- **Phase 6 last** because settings and polish don't affect core functionality but do affect demo quality.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** x402 gateway integration from MV3 service worker is a novel pattern. Need to validate: (a) exact endpoint URL for OpenGradient LLM, (b) @x402/fetch compatibility with service worker `fetch()`, (c) wallet key management UX. Recommend a 1-day spike before committing to the full phase plan.
- **Phase 2:** Platform-specific DOM selectors for Telegram Web and Gmail are brittle and undocumented. Need to inspect live DOM structure during implementation.
- **Phase 5:** MemSync auth flow for new extension users is unclear. How does a user get their initial API key/bearer token? The `POST /v1/api-keys` endpoint exists but the bootstrapping flow needs investigation.

Phases with standard patterns (skip research-phase):
- **Phase 3:** chrome.storage.local CRUD + React popup is extremely well-documented MV3 pattern. Hundreds of examples exist.
- **Phase 4:** chrome.alarms + chrome.notifications is standard, well-documented Chrome extension pattern.
- **Phase 6:** Options pages and error handling are standard patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Core extension stack (WXT, React, TS, Tailwind) is HIGH confidence. OpenGradient x402 integration from browser extension is LOW -- novel pattern, no community precedent. The @x402/fetch package exists and is documented but has not been tested in MV3 service workers. |
| Features | MEDIUM | Table stakes and differentiators are well-defined. Competitor analysis confirms the TEE verification angle is genuinely novel. Feature complexity estimates are reasonable but untested. |
| Architecture | HIGH | MV3 extension architecture is well-documented and standard. The service worker orchestrator pattern, dual storage approach, and message-passing contracts are proven patterns used by thousands of extensions. |
| Pitfalls | HIGH | Multiple authoritative sources (Chrome docs, OWASP, security research) confirm each pitfall. Service worker termination, credential exposure, and content script security are well-documented failure modes with known mitigations. |

**Overall confidence:** MEDIUM

The core extension architecture and Chrome APIs are HIGH confidence. The risk concentrates entirely on the OpenGradient x402 integration, which is the single novel element. If the x402 gateway works as documented from a service worker context, the project is straightforward. If it does not, a fallback to a Python FastAPI proxy adds 1-2 days and infrastructure complexity.

### Gaps to Address

- **x402 Gateway endpoint URL:** The exact URL for OpenGradient LLM inference via x402 is uncertain. Architecture research found `https://llmogevm.opengradient.ai/v1/chat/completions` but this needs validation. Check OpenGradient Discord or test directly.
- **Service worker + @x402/fetch compatibility:** No documented usage of @x402/fetch in MV3 service workers. Must be validated in the Phase 1 spike before committing to the pure-JS architecture.
- **MemSync auth bootstrapping:** How does a new user get their initial MemSync API key from the extension? The initial OAuth or account creation flow is not documented in public API docs. Reference the existing MemSync Chrome extension as a template.
- **MemSync rate limits:** Rate limiting exists (there is a `/v1/users/rate-limits` endpoint) but limits are not publicly documented. Could be a blocker at scale. Not a demo risk, but a production risk.
- **Wallet private key UX:** Storing an EVM private key in a browser extension is a security concern. For demo, `chrome.storage.session` is acceptable. For production, need encrypted storage with user passphrase or hardware wallet integration.
- **OpenGradient model availability:** Claude 4.0 Sonnet is documented but model availability on the x402 gateway vs the Python SDK may differ. Test during spike.

## Sources

### Primary (HIGH confidence)
- [Chrome Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3) -- MV3 architecture, service worker lifecycle
- [Chrome Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) -- 5-min termination behavior
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) -- local/sync/session differences
- [Chrome Alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms) -- minimum intervals, persistence
- [OWASP Browser Extension Vulnerabilities](https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html) -- security patterns
- [OpenGradient LLM Docs](https://docs.opengradient.ai/developers/sdk/llm.html) -- models, TEE modes, settlement
- [OpenGradient x402 Gateway Docs](https://docs.opengradient.ai/developers/x402/) -- HTTP gateway, API reference, TypeScript examples
- [MemSync API (Swagger)](https://api.memchat.io/docs) -- full OpenAPI spec
- [WXT Framework](https://wxt.dev/) -- v0.20.17, module-react, cross-browser support
- [x402 Protocol](https://www.x402.org/ecosystem) -- payment standard, TypeScript client

### Secondary (MEDIUM confidence)
- [MemSync Developer Docs](https://memsync.mintlify.app/) -- guide structure, auth patterns
- [@x402/fetch on npm](https://www.npmjs.com/package/@x402/fetch) -- v2.1.0 API surface
- [Chrome Extension Frameworks Comparison 2025-2026](https://www.devkit.best/blog/mdx/chrome-extension-framework-comparison-2025) -- WXT vs Plasmo vs CRXJS
- [Security.com: Chrome Extension Credentials Research](https://www.security.com/threat-intelligence/chrome-extension-credentials) -- credential exposure patterns
- [Extension Radar: Chrome Extension Rejection Reasons](https://www.extensionradar.com/blog/chrome-extension-rejected) -- permission overreach patterns

### Tertiary (LOW confidence -- needs validation)
- OpenGradient x402 LLM endpoint URL (`https://llmogevm.opengradient.ai`) -- found in docs but untested from browser context
- MemSync rate limits -- endpoint exists but limits not published
- @x402/fetch + MV3 service worker compatibility -- no community usage found

---
*Research completed: 2026-02-14*
*Ready for roadmap: yes*

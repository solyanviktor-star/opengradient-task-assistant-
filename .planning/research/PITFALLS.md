# Pitfalls Research

**Domain:** Browser Extension with AI Integration (OpenGradient + MemSync)
**Researched:** 2026-02-14
**Confidence:** HIGH (multiple authoritative sources confirm each pitfall)

## Critical Pitfalls

### Pitfall 1: Service Worker Termination Kills Long-Running AI Calls

**What goes wrong:**
Chrome terminates Manifest V3 service workers after 30 seconds of inactivity, and hard-kills any single operation after 5 minutes. AI inference calls to OpenGradient (which runs on-chain or through TEE infrastructure) can easily exceed these limits. The service worker dies mid-request, the response is lost, and the user sees nothing -- or worse, a silent failure with no error message.

**Why it happens:**
Developers build and test with DevTools open, which keeps the service worker alive. Everything works in development. In production, Chrome aggressively reclaims resources. Manifest V2 had persistent background pages; MV3 does not. This is the single biggest architectural difference and the most common source of "it works on my machine" bugs.

**How to avoid:**
- Route ALL long-running AI calls through an offscreen document (chrome.offscreen API, available since Chrome 114). The offscreen document stays alive independently of the service worker.
- Use chrome.alarms API instead of setTimeout/setInterval for any delayed or periodic operations.
- If an offscreen document is not viable, implement a keep-alive ping: a content script or popup opens a port connection to the service worker and sends a trivial message every 25 seconds to reset the idle timer.
- Design all operations to be resumable: persist request state to chrome.storage.session before starting the AI call, so if the worker does die, it can resume on restart.

**Warning signs:**
- AI calls succeed in development but silently fail in production.
- Users report intermittent "no response" issues that are hard to reproduce.
- console.log statements in the service worker stop appearing after ~30 seconds.
- setTimeout callbacks never fire.

**Phase to address:**
Phase 1 (Foundation/Scaffolding). The service worker lifecycle strategy must be decided before any AI integration code is written. Retrofitting offscreen documents into an existing architecture is painful.

---

### Pitfall 2: API Keys and Credentials Exposed in Extension Package

**What goes wrong:**
Any JavaScript file shipped in a Chrome extension can be read by anyone who installs it -- just navigate to `chrome-extension://<id>/` or unpack the .crx file. API keys, wallet private keys, OpenGradient credentials, or any hardcoded secrets are immediately compromised. In June 2025, researchers found hardcoded credentials in 90+ extensions serving 15 million users.

**Why it happens:**
Browser extensions feel like "server-side" code because they run in a privileged context. Developers treat the service worker like a backend. But the extension package is fully client-side and fully inspectable. There is no server protecting your secrets.

**How to avoid:**
- NEVER hardcode API keys, private keys, or tokens in extension source code.
- For OpenGradient: the user must bring their own credentials (wallet + model hub account). Store encrypted in chrome.storage.local using Web Crypto API (AES-GCM). Derive the encryption key from a user-provided password or use chrome.storage.session for ephemeral session-only storage.
- If a shared API key is needed (e.g., for a proxy endpoint), route through a lightweight backend proxy that holds the key server-side.
- For the demo: use chrome.storage.session (in-memory, cleared on browser close) for any credentials during the session. This avoids both disk persistence and encryption complexity.

**Warning signs:**
- Any string literal in source code that looks like a key (starts with `sk-`, `0x`, `pk_`, etc.).
- A `config.js` or `constants.js` file with credential-like values.
- API calls made directly from content scripts or service worker without a proxy layer.

**Phase to address:**
Phase 1 (Foundation). Credential management architecture must be established before any API integration begins. This is a non-negotiable for a Web3/crypto audience who will immediately inspect the extension source.

---

### Pitfall 3: Content Scripts Leaking Sensitive Data to Host Pages

**What goes wrong:**
Content scripts share the DOM with the host page. If the extension reads email content, chat messages, or other sensitive data and renders it back into the DOM (even temporarily), the host page's JavaScript can intercept it. Attackers can also override JavaScript prototypes (`Array.prototype.push`, `JSON.stringify`, etc.) to intercept data flowing through content scripts -- even Shadow DOM is not safe against this.

**Why it happens:**
Content scripts feel isolated because they have a separate JavaScript execution context. But DOM access is shared. Developers inject UI elements containing sensitive data directly into the page DOM, not realizing that the page's own scripts can read it. This is exactly how the Gmail-targeting malicious extensions in early 2025 exfiltrated email content.

**How to avoid:**
- NEVER render sensitive data (emails, chat content, AI analysis results) into the host page's DOM.
- Content scripts should ONLY extract data and pass it via chrome.runtime.sendMessage to the service worker or a popup/side panel. All sensitive display happens in extension-controlled contexts (popup, side panel, offscreen document).
- Minimize content script code: it should be a thin data extraction + message relay layer, nothing more.
- Use the `"world": "ISOLATED"` content script configuration (default in MV3) and validate all messages received from the page using sender.id checks.
- Avoid storing extracted data in variables that persist longer than the immediate send operation.

**Warning signs:**
- Content script creates DOM elements containing user data (emails, messages, analysis results).
- Content script is larger than ~100 lines (suggests too much logic in an untrusted context).
- Content script uses innerHTML or document.createElement to display results on-page.
- No message validation on the receiving end (service worker accepts any message shape).

**Phase to address:**
Phase 2 (Content Script + Data Extraction). Architecture decision, but implementation happens when building content scripts. Define the extraction-only contract before writing content script code.

---

### Pitfall 4: OpenGradient SDK is Python-Only -- No Browser-Native Path

**What goes wrong:**
The OpenGradient SDK (OG-SDK) is Python-only. There is no TypeScript/JavaScript SDK available (listed as "under development" with no release date). Developers assume they can `npm install opengradient` and call it from the extension. This does not exist. The entire integration strategy must account for this gap, or the project stalls when the developer discovers it mid-build.

**Why it happens:**
The OpenGradient docs mention TypeScript as "under development," which creates a false expectation that it might be available soon. The Python SDK is well-documented and easy to use, leading developers to prototype in Python and assume porting will be straightforward.

**How to avoid:**
- Accept this constraint upfront and design around it from day one.
- Option A (recommended for 5-7 day timeline): Use OpenGradient's REST API endpoints directly via fetch() from the service worker. Bypass the SDK entirely. Reverse-engineer the API calls from the Python SDK source code if documentation is incomplete.
- Option B: Run a minimal Python backend (Flask/FastAPI) that wraps the OG-SDK and exposes a simple REST API for the extension to call. Adds deployment complexity but guarantees SDK compatibility.
- Option C: If OpenGradient exposes Solidity smart contract interfaces, call them directly via ethers.js/viem from the extension (since the target audience already has Web3 wallets).
- Do NOT wait for a TypeScript SDK release. Plan for what exists today.

**Warning signs:**
- Project plan includes "install OpenGradient SDK" as a task without specifying the language bridge strategy.
- No spike/prototype for the OG integration in the first 1-2 days.
- Discovery of the Python-only limitation after other components are built.

**Phase to address:**
Phase 1 (Foundation). The OpenGradient integration strategy is the highest-risk technical decision. Spike it first. If direct REST API calls work, proceed. If not, pivot to the backend proxy approach immediately.

---

### Pitfall 5: Overly Broad Permissions Triggering Web Store Rejection and User Distrust

**What goes wrong:**
The extension requests `<all_urls>`, `tabs`, `webNavigation`, and other broad permissions "just in case." The Chrome Web Store rejects the submission for requesting permissions beyond what the extension actually needs. Even if it passes review, crypto/Web3 users (the target audience) are highly security-conscious and will refuse to install an extension with broad permissions. Overly broad permissions are the #1 rejection reason in Web Store reviews.

**Why it happens:**
During development, it is easier to request broad permissions and narrow later. Developers use `<all_urls>` in host_permissions for convenience during testing. By launch time, nobody goes back to audit which permissions are actually needed.

**How to avoid:**
- Start with ZERO permissions and add each one only when a specific feature requires it.
- Use `activeTab` instead of `<all_urls>` wherever possible (grants temporary access to the current tab only when the user clicks the extension).
- Use `optional_permissions` for features that only some users need, requesting them at runtime with `chrome.permissions.request()`.
- For content scripts that only run on specific sites (Gmail, Telegram Web, etc.), use narrow match patterns: `"matches": ["https://mail.google.com/*"]` not `"matches": ["<all_urls>"]`.
- Document every permission in the extension description with a clear "why we need this" explanation.

**Warning signs:**
- manifest.json has `<all_urls>` in permissions or host_permissions.
- More than 5 permissions listed in the manifest.
- No optional_permissions section exists.
- Content script matches use wildcards broader than needed.

**Phase to address:**
Phase 1 (Manifest Setup). Lock down permissions in the manifest from the start. Every permission should be justified with a comment in the manifest file.

---

### Pitfall 6: Unencrypted Sensitive Data in chrome.storage.local

**What goes wrong:**
The extension stores extracted email content, chat messages, AI analysis results, or wallet-adjacent data in `chrome.storage.local` without encryption. This data is written as plaintext JSON to the user's Chrome profile directory on disk. Any other extension, malware, or person with filesystem access can read it. For a MemSync-integrated extension handling potentially private communications, this is a data breach waiting to happen.

**Why it happens:**
`chrome.storage.local` feels "internal" and "private" because it is namespaced per extension. But it has zero encryption. The Chrome Storage API provides better isolation than `localStorage` but still stores data as plaintext on disk. Developers assume the API name implies security it does not provide.

**How to avoid:**
- For session-only data: use `chrome.storage.session` (in-memory only, never touches disk, cleared on browser close). Ideal for extracted content being processed in the current session.
- For persistent data that must survive browser restarts: encrypt before writing to `chrome.storage.local` using the Web Crypto API with AES-GCM. Derive keys from user input (passphrase), never hardcode them.
- For the demo (5-7 day timeline): use `chrome.storage.session` exclusively. Avoid persistent sensitive storage entirely. This sidesteps the encryption implementation and is actually better privacy practice for a demo.
- Never store raw email content, chat transcripts, or AI inference results on disk.

**Warning signs:**
- `chrome.storage.local.set()` called with objects containing email bodies, messages, or user content.
- No calls to Web Crypto API or any encryption library in the codebase.
- Large data objects being persisted that contain user-generated content.

**Phase to address:**
Phase 2 (Storage Layer). Decision point: session-only vs. persistent. For a demo, session-only is the correct answer.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoded site-specific DOM selectors for email/chat extraction | Fast to build, works today | Gmail/Telegram DOM changes break the extension silently; no error, just no data | Acceptable for demo; must add selector validation and fallback detection for production |
| Polling DOM for changes instead of MutationObserver | Simpler code, easier to reason about | CPU drain, battery impact, misses rapid changes, laggy UX | Never -- MutationObserver is equally simple and dramatically more efficient |
| Storing all state in service worker global variables | No async storage overhead | All state lost on service worker termination (every 30 seconds of idle) | Never -- use chrome.storage.session for any state that must survive worker restarts |
| Using `any` types throughout TypeScript codebase | Faster initial development | Lose all type safety benefits; bugs hide in message passing interfaces | Only for initial prototyping (<24 hours), then replace with proper interfaces |
| Skipping message validation between content script and service worker | Fewer lines of code | Any page can send messages to your service worker and trigger actions | Never -- always validate sender.id and message shape |
| Bundling the entire ethers.js library | Works immediately | Extension bundle grows 1-5MB; slow install, slow load | Use viem (smaller) or import only needed ethers subpackages |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OpenGradient AI Inference | Assuming synchronous request/response like a REST API; not handling the async blockchain-based inference flow | Design for async: send inference request, store request ID, poll or listen for completion, handle timeouts explicitly |
| OpenGradient Model Hub | Hardcoding model IDs that may change on testnet | Store model references in a config object; validate model availability before inference; handle "model not found" gracefully |
| MemSync Storage | Treating TEE-based storage like a fast local cache | MemSync involves network round-trips and TEE attestation; design for latency (500ms-2s); implement optimistic UI with local state + sync |
| Cross-Origin API Calls | Making fetch() calls from content scripts expecting CORS bypass | Content scripts NEVER bypass CORS, even with host_permissions. Route ALL external API calls through the service worker, which does bypass CORS when host_permissions are declared |
| Web3 Wallet (MetaMask) | Injecting wallet connection logic in the content script | Use a popup or side panel for wallet interactions; content scripts cannot reliably interact with MetaMask's injected provider due to isolated worlds |
| Chrome Web Store Submission | Submitting with remotely-hosted code (CDN script tags, eval of fetched code) | Bundle ALL code locally in the extension package; no remote code execution allowed in MV3 |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Content script injected on every page load via `"matches": ["<all_urls>"]` | Browser slowdown, high memory usage, extension flagged as resource-heavy | Use narrow match patterns; inject only on target sites (Gmail, Telegram, etc.) | >20 tabs open; immediately noticeable |
| Extracting full email threads instead of visible/new content | AI API calls with massive payloads, slow responses, high token costs | Extract only the latest message or visible content; truncate to reasonable token limit (4K-8K tokens) | First email thread with >50 messages |
| No debouncing on DOM mutation observers | Hundreds of AI calls triggered per second during page load/scroll | Debounce observer callbacks (300-500ms); batch mutations; use a processing queue | Any dynamic page (Gmail, Slack, Telegram Web) |
| Synchronous chrome.storage reads in hot paths | UI jank; service worker blocked | Always use async/await; batch storage reads; cache frequently accessed values in memory | >10 storage reads per user action |
| Storing full AI inference results history without pruning | chrome.storage.local fills up (10MB default limit for local, 1MB for session) | Implement LRU eviction or time-based pruning; store summaries, not full results | After ~1 week of regular use |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Rendering AI analysis results into host page DOM | Host page JavaScript reads the analysis; if it contains sensitive email/chat data, it's leaked to potentially malicious page scripts | Display ALL results in extension-controlled UI: popup, side panel, or offscreen document -- never in content script DOM injections |
| Not validating message senders in service worker | Any web page can send messages to the extension via externally_connectable or by guessing the extension ID; attacker triggers AI inference or reads stored data | Always check `sender.id === chrome.runtime.id` and validate message.action against an allowlist |
| Using innerHTML with AI-generated content | LLM outputs can contain HTML/script injections; model could be prompted to output malicious payloads | Use textContent for plain text; use DOMPurify if HTML rendering is needed; implement Content Security Policy in manifest |
| Logging sensitive data to console in production | Console output is accessible to any page script in the content script context; DevTools-attached users can see all data | Strip all console.log of sensitive data in production builds; use a logger with environment-aware filtering |
| Sending raw user content to AI API without sanitization | PII (names, addresses, account numbers) sent to external inference service without user awareness | Implement a data sanitization layer: strip or redact obvious PII patterns before sending to OpenGradient; show user what data will be sent |
| Extension-to-extension messaging without origin checks | Other installed extensions can communicate with yours if externally_connectable is misconfigured | Do not use externally_connectable unless required; if used, restrict to specific extension IDs |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No loading state during AI inference | User clicks button, nothing happens for 3-15 seconds, clicks again, triggers duplicate requests | Show immediate spinner/skeleton UI; disable the trigger button; show estimated wait time |
| Requesting all permissions on install | User sees scary permission dialog, abandons installation (especially crypto/Web3 users) | Use optional_permissions; request at point-of-need with clear explanation of why |
| Silent failures when AI API is unavailable | User thinks extension is broken; no way to know if it is a network issue, rate limit, or bug | Always surface errors in the UI: "AI service temporarily unavailable, retry in 30s" with a retry button |
| Auto-processing content without user consent | User did not ask for their email to be analyzed; feels like surveillance | Require explicit user action (click to analyze); show what data will be sent; never auto-send content to external APIs |
| Extension popup closes when user clicks away | User loses context, partially filled forms, in-progress results | Use a side panel (chrome.sidePanel API) instead of popup for any workflow that takes more than one click |
| No offline/degraded mode | Extension is completely non-functional when AI API is down | Cache recent results; show cached data with "offline" badge; queue requests for retry |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Content Script Extraction:** Works on initial page load but NOT on dynamic content loaded via SPA navigation (Gmail, Telegram use client-side routing) -- verify by navigating between emails/chats without full page reload
- [ ] **Service Worker:** Passes all tests but has not been tested after 30+ seconds of idle -- verify by stepping away, returning, and triggering an action
- [ ] **AI Integration:** Returns results for test inputs but has no error handling for rate limits, network failures, malformed responses, or model unavailability -- verify by disconnecting network mid-request
- [ ] **Permissions:** Extension works locally with `--load-extension` but manifest permissions are too broad for Web Store submission -- verify by running `chrome://extensions/` audit
- [ ] **Storage:** Data persists in testing but chrome.storage.session is cleared on browser restart -- verify by closing and reopening browser, checking if state is preserved as expected
- [ ] **Cross-Origin Requests:** API calls work from service worker but NOT from content scripts -- verify by checking network tab for CORS errors when content scripts make direct API calls
- [ ] **Message Passing:** Content script -> service worker flow works, but service worker -> content script fails when tab is not focused or content script has not loaded yet -- verify by sending messages to newly opened tabs
- [ ] **Demo Flow:** Happy path works, but first error during live demo has no graceful recovery -- verify by simulating every failure mode during a practice run

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Service worker dying mid-AI-call | MEDIUM | Implement request persistence + retry: save pending request to storage before sending, check for pending requests on worker startup, retry automatically |
| API keys exposed in published extension | HIGH | Immediately rotate all exposed keys; publish updated extension; notify affected users; implement server-side proxy; audit for data accessed with compromised keys |
| Content script leaking data to page | HIGH | Cannot un-leak data; issue security advisory; redesign to use extension-controlled UI; audit what data was exposed |
| chrome.storage.local full (10MB limit) | LOW | Implement emergency pruning: delete oldest entries first; switch to chrome.storage.session for non-persistent data; add size monitoring |
| Web Store rejection for permissions | LOW | Audit manifest; replace broad permissions with narrow ones + optional_permissions; resubmit (review takes 1-3 business days) |
| OpenGradient API rate limited | MEDIUM | Implement exponential backoff + request queue; cache inference results; batch similar requests; add user-facing rate limit messaging |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Service worker termination | Phase 1: Foundation | Service worker survives 5+ minutes of idle; AI call completes after 60+ seconds |
| API key exposure | Phase 1: Foundation | Zero hardcoded strings matching key patterns in source; credentials only from user input or chrome.storage.session |
| Content script data leakage | Phase 2: Content Scripts | Content script <100 lines; all sensitive data displayed only in popup/side panel; no innerHTML with user data |
| OpenGradient SDK gap | Phase 1: Foundation (spike) | Working prototype of one AI inference call from the extension within first 2 days |
| Permission overreach | Phase 1: Manifest Setup | manifest.json reviewed; each permission has a documented justification; optional_permissions used where possible |
| Unencrypted storage | Phase 2: Storage Layer | All sensitive data uses chrome.storage.session; no plaintext user content in chrome.storage.local |
| DOM selector brittleness | Phase 2: Content Scripts | Selectors wrapped in try/catch with fallback detection; logged warnings when selectors fail |
| No error handling on AI calls | Phase 3: AI Integration | Every AI call has timeout, retry, and user-facing error state; tested with network disconnection |
| Scope creep beyond demo needs | All phases | Feature added only if it is in the demo script; hard cutoff at day 5 for new features |
| Cross-origin from content script | Phase 2: Content Scripts | All fetch() calls route through service worker; content scripts use message passing only |

## Sources

- [Chrome Developer Docs: Extension Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) -- HIGH confidence
- [Chrome Developer Docs: Stay Secure](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure) -- HIGH confidence
- [Chrome Developer Docs: Cross-origin Network Requests](https://developer.chrome.com/docs/extensions/mv3/network-requests/) -- HIGH confidence
- [OWASP Browser Extension Vulnerabilities Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html) -- HIGH confidence
- [Chrome Developer Docs: Troubleshooting Web Store Violations](https://developer.chrome.com/docs/webstore/troubleshooting) -- HIGH confidence
- [Chrome Developer Docs: MV3 Additional Requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements) -- HIGH confidence
- [OpenGradient SDK Docs](https://docs.opengradient.ai/developers/sdk/) -- HIGH confidence (Python-only SDK confirmed)
- [Chromium Bug Tracker: Service Worker 5-minute Kill](https://issues.chromium.org/issues/40733525) -- HIGH confidence
- [Security.com: Chrome Extension Credentials Research](https://www.security.com/threat-intelligence/chrome-extension-credentials) -- MEDIUM confidence
- [The Hacker News: Chrome Extensions Leak API Keys](https://thehackernews.com/2025/06/popular-chrome-extensions-leak-api-keys.html) -- MEDIUM confidence
- [Duo Security: Message Passing Security](https://duo.com/labs/tech-notes/message-passing-and-security-considerations-in-chrome-extensions) -- MEDIUM confidence
- [Extension Radar: Chrome Extension Rejection Reasons](https://www.extensionradar.com/blog/chrome-extension-rejected) -- MEDIUM confidence
- [W3C WebExtensions: Secure Storage Proposal](https://github.com/w3c/webextensions/blob/main/proposals/secure-storage.md) -- MEDIUM confidence

---
*Pitfalls research for: Browser Extension + AI Integration (OpenGradient/MemSync)*
*Researched: 2026-02-14*

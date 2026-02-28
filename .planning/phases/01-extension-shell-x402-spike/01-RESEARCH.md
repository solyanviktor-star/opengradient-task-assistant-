# Phase 1: Extension Shell + x402 Spike - Research

**Researched:** 2026-02-14
**Domain:** Chrome MV3 Extension Scaffolding + OpenGradient x402 Gateway Integration
**Confidence:** MEDIUM (extension shell is HIGH; x402 from service worker is LOW -- novel pattern, no community precedent)

## Summary

Phase 1 delivers two things: a working Chrome extension shell (install, icon, popup, service worker) and a validated x402 gateway spike proving JavaScript can call OpenGradient's TEE-verified LLM from a service worker. The extension shell is a solved problem -- WXT framework generates MV3 manifests automatically, provides hot-reload, and has first-class React support. The x402 spike is the highest-risk item in the entire project because no one has documented calling `@x402/fetch` from an MV3 service worker before.

The x402 protocol works by wrapping native `fetch()` to auto-handle 402 Payment Required responses with EIP-712 signed payment proofs. Since MV3 service workers have full `fetch()` access and `viem` (the Ethereum library used for signing) explicitly supports all modern browsers, there is no technical reason this should fail -- but it has never been tested in this specific context. The spike must be the very first task after scaffolding, because if it fails, the fallback (Python FastAPI proxy) adds 1-2 days to the timeline.

The service worker lifecycle is the other critical concern. Chrome terminates service workers after 30 seconds of inactivity and hard-kills single operations after 5 minutes. LLM inference calls can take 2-15 seconds (well within limits for a single call), but the 30-second idle timer means the worker may die between user actions. Since Chrome 110, all extension API calls reset the idle timer, and `chrome.alarms` (minimum 30-second period) can wake the worker reliably. For Phase 1, the service worker just needs to initialize cleanly and survive long enough to make one x402 API call -- the more sophisticated keep-alive patterns (offscreen documents) are only needed in Phase 2+ when real extraction flows run.

**Primary recommendation:** Use WXT with React to scaffold the extension shell (takes ~30 minutes), then immediately spike the x402 gateway call from the service worker. If the spike succeeds, the entire project architecture is validated. If it fails, pivot to a Python proxy the same day.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **WXT** | 0.20.17+ | Extension framework | Market leader for 2026. Vite-powered, auto-generates MV3 manifest from file structure, best HMR, framework-agnostic. 9.2k+ GitHub stars, 224+ releases. |
| **React** | 18.x | Popup UI framework | Largest extension ecosystem. WXT has first-class support via `@wxt-dev/module-react`. |
| **TypeScript** | 5.x | Type safety | Catches manifest permission errors and message-passing bugs at compile time. WXT is TypeScript-first. |
| **@x402/fetch** | 2.1.0 | x402 payment-gated HTTP client | Wraps native `fetch()` to auto-handle 402 Payment Required. Required for calling OpenGradient LLM gateway without Python SDK. |
| **@x402/evm** | latest | EVM payment scheme for x402 | Registers the EVM signing scheme using `ExactEvmScheme` so `@x402/fetch` can create payment proofs. Required alongside `@x402/fetch`. |
| **viem** | latest | Ethereum utilities | Used by `@x402/evm` for `privateKeyToAccount()`. Browser-compatible, tree-shakable, TypeScript-first. Explicitly supports all modern browsers. |

### Supporting (Phase 1 only)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **@wxt-dev/module-react** | 1.1.5+ | WXT React integration | Add to `modules` in wxt.config.ts to enable React in entrypoints |
| **Tailwind CSS** | 4.x | Popup styling | One-line import (`@import "tailwindcss"`), 5x faster builds, Chrome 111+ |
| **pnpm** | latest | Package manager | Fastest installs, strictest dependency resolution, used in WXT examples |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| WXT | Plasmo | Plasmo has more stars but maintenance concerns. WXT has better HMR, smaller bundles, more active development. |
| WXT | Raw Vite + manual manifest | Wastes 1-2 days on boilerplate WXT automates. No HMR for service workers. |
| viem | ethers.js | ethers.js is larger (1-5MB), less tree-shakable. x402 examples use viem. |
| @x402/fetch | Manual 402 handling | x402 protocol involves EIP-712 signing, nonce management, payment header encoding. Don't hand-roll. |

**Installation:**
```bash
# Scaffold WXT project with React template
pnpm dlx wxt@latest init opengradient-task-assistant --template react

cd opengradient-task-assistant

# x402 + Ethereum signing
pnpm add @x402/fetch @x402/evm viem

# Styling
pnpm add -D tailwindcss

# Dev tools
pnpm add -D @types/chrome
```

## Architecture Patterns

### Recommended Project Structure (Phase 1)
```
opengradient-task-assistant/
├── entrypoints/
│   ├── background.ts              # Service worker: lifecycle + x402 spike
│   └── popup/
│       ├── index.html             # Popup HTML shell
│       ├── main.tsx               # React entry point
│       ├── App.tsx                # Root React component
│       └── style.css              # Tailwind import
├── lib/
│   └── opengradient.ts           # x402 client wrapper (shared utility)
├── public/
│   ├── icon-16.png               # Extension icon 16px
│   ├── icon-48.png               # Extension icon 48px
│   └── icon-128.png              # Extension icon 128px
├── wxt.config.ts                  # WXT + manifest configuration
├── package.json
└── tsconfig.json
```

### Pattern 1: WXT Background Service Worker
**What:** WXT auto-generates the MV3 service worker registration in manifest.json from `entrypoints/background.ts`. Use `defineBackground()` to register lifecycle handlers.
**When to use:** Always -- this is how WXT works. No manual manifest editing needed.
**Source:** [WXT Entrypoints Documentation](https://wxt.dev/guide/essentials/entrypoints.html)

```typescript
// entrypoints/background.ts
export default defineBackground(() => {
  console.log('Service worker initialized', { id: browser.runtime.id });

  // Handle extension install/update
  browser.runtime.onInstalled.addListener((details) => {
    console.log('Extension installed/updated:', details.reason);
  });

  // Handle messages from popup or content scripts
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ status: 'alive' });
    }
    if (message.type === 'TEST_X402') {
      handleX402Test()
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true; // Keep channel open for async response
    }
  });
});
```

**Critical WXT rule:** All runtime code MUST be inside the `defineBackground()` callback or the `main()` function. WXT imports the file in a Node.js environment during build -- code outside the callback will fail.

### Pattern 2: x402 Gateway Client
**What:** Wrap `fetch()` with `@x402/fetch` to auto-handle 402 Payment Required responses from OpenGradient's LLM endpoint. The wrapper intercepts 402 responses, signs an EIP-712 payment proof using the user's private key, and resubmits the request with the signed payment in the `X-PAYMENT` header.
**When to use:** For ALL calls to `https://llmogevm.opengradient.ai`.
**Source:** [OpenGradient x402 Examples](https://docs.opengradient.ai/developers/x402/examples), [OpenGradient x402 API Reference](https://docs.opengradient.ai/developers/x402/api-reference)

```typescript
// lib/opengradient.ts
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

const OG_ENDPOINT = "https://llmogevm.opengradient.ai/v1/chat/completions";

export function createX402Client(privateKey: `0x${string}`) {
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

export async function testLLMCall(
  x402Fetch: typeof fetch,
  prompt: string = "Say hello in one sentence."
): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    const response = await x402Fetch(OG_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 100,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const data = await response.json();
    return {
      success: true,
      content: data.choices?.[0]?.message?.content ?? "No content returned",
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
```

### Pattern 3: WXT Popup with React
**What:** WXT auto-discovers `entrypoints/popup/index.html` and generates `action.default_popup` in the manifest. React is mounted via a script tag referencing a `.tsx` file.
**When to use:** For the popup UI.
**Source:** [WXT Entrypoints - Popup](https://wxt.dev/guide/essentials/entrypoints.html)

```html
<!-- entrypoints/popup/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenGradient Task Assistant</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

```tsx
// entrypoints/popup/main.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';

createRoot(document.getElementById('root')!).render(<App />);
```

```tsx
// entrypoints/popup/App.tsx
import { useState } from 'react';

export default function App() {
  const [status, setStatus] = useState<string>('Ready');

  const handleTestX402 = async () => {
    setStatus('Testing x402...');
    const response = await browser.runtime.sendMessage({ type: 'TEST_X402' });
    setStatus(response.success
      ? `Success: ${response.data.content}`
      : `Error: ${response.error}`
    );
  };

  return (
    <div style={{ width: 350, padding: 16 }}>
      <h1>OpenGradient Task Assistant</h1>
      <p>Status: {status}</p>
      <button onClick={handleTestX402}>Test x402 Gateway</button>
    </div>
  );
}
```

### Pattern 4: WXT Manifest Configuration
**What:** Configure permissions, host_permissions, and extension metadata in `wxt.config.ts`. WXT merges this with auto-discovered entrypoint metadata to produce the final `manifest.json`.
**When to use:** Always -- this is the single source of truth for manifest configuration.
**Source:** [WXT Manifest Configuration](https://wxt.dev/guide/essentials/config/manifest)

```typescript
// wxt.config.ts
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'OpenGradient Task Assistant',
    description: 'AI-powered task extraction with TEE-verified privacy',
    permissions: [
      'storage',         // chrome.storage.local for task cache
      'activeTab',       // Temporary access to current tab on click
    ],
    host_permissions: [
      'https://llmogevm.opengradient.ai/*',  // OpenGradient x402 LLM gateway
      'https://rpc.opengradient.ai/*',       // OpenGradient RPC (for viem)
    ],
  },
});
```

### Anti-Patterns to Avoid
- **Hardcoding private keys in source:** Any JS shipped in a Chrome extension is inspectable. Store keys in `chrome.storage.session` (in-memory, cleared on browser close) or prompt user at runtime.
- **Calling x402 from popup directly:** Popup closes when user clicks away. All API calls must go through the service worker via `browser.runtime.sendMessage`.
- **Using `<all_urls>` in host_permissions:** Only declare the exact domains needed. Broad permissions trigger Web Store rejection and scare crypto-savvy users.
- **Code outside defineBackground():** WXT imports entrypoints at build time in Node.js. Runtime code outside the callback will execute during build and fail.
- **Using window.localStorage in service worker:** Not available. Use `chrome.storage.local` (persistent) or `chrome.storage.session` (ephemeral).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| x402 payment protocol | Custom 402 response handling + EIP-712 signing + nonce tracking + payment header encoding | `@x402/fetch` + `@x402/evm` | x402 involves a multi-step dance: initial request, parse payment requirements, sign EIP-712 typed data, encode payment, resubmit. Off-by-one in nonce or encoding = rejected payments. |
| MV3 manifest generation | Manual manifest.json with entrypoint registration | WXT auto-generation | WXT discovers entrypoints from file structure, handles MV2/MV3 differences, adds dev-only permissions for HMR, and validates the manifest at build time. |
| Extension HMR | Custom webpack/vite config for service worker + popup hot reload | WXT dev server | WXT provides HMR for popup UI and fast-reload for service worker and content scripts out of the box. |
| Ethereum account management | Custom key derivation / signing | `viem` `privateKeyToAccount` | viem handles key formats, EIP-712 domain separation, typed data hashing. Browser-compatible, tree-shakable. |
| Popup-to-service-worker messaging | Custom postMessage + event listeners | `browser.runtime.sendMessage` / `browser.runtime.onMessage` | Chrome's built-in messaging handles serialization, routing, lifetime extension, and error propagation. |

**Key insight:** Phase 1 is scaffolding and validation. Every minute spent building infrastructure that WXT or x402 already provides is a minute not spent on the spike that determines whether the entire project architecture works.

## Common Pitfalls

### Pitfall 1: Service Worker Dies During x402 Call
**What goes wrong:** Chrome terminates the service worker after 30 seconds of inactivity or 5 minutes total for a single operation. If the x402 payment flow (initial request -> 402 response -> sign payment -> resubmit with payment -> get LLM response) takes too long or the worker goes idle between steps, the call fails silently.
**Why it happens:** Developers test with DevTools open, which keeps the worker alive. In production, Chrome aggressively reclaims resources.
**How to avoid:** For Phase 1, this is LOW risk -- a single x402 LLM call takes 2-15 seconds, well within limits. The `@x402/fetch` wrapper handles the 402 flow as a single async operation, so there is no idle gap between steps. However, ensure the service worker makes the call in response to a message (which resets the idle timer). Do NOT rely on the worker being alive "on its own" -- always trigger via `browser.runtime.sendMessage` from the popup.
**Warning signs:** x402 calls succeed in DevTools but fail intermittently in normal usage.

### Pitfall 2: Private Key Hardcoded in Source
**What goes wrong:** Extension JavaScript is fully inspectable. Any `0x...` string in the source code is immediately visible to anyone who installs the extension. For a crypto/Web3 audience, this is a project-ending trust violation.
**Why it happens:** During development, hardcoding a test key is convenient. It never gets replaced.
**How to avoid:** From day one, use `chrome.storage.session` to store the private key (in-memory, cleared on browser close). For the Phase 1 spike, prompt the user to paste their key in the popup, then store it in session storage. Never commit a key to source.
**Warning signs:** Any string starting with `0x` followed by 64 hex characters in source code.

### Pitfall 3: WXT Build-Time vs Runtime Confusion
**What goes wrong:** Code placed outside `defineBackground()` or `defineContentScript()` callbacks executes during WXT's build step in Node.js, not at runtime in the browser. This causes mysterious "module not found" or "undefined" errors that disappear when you add console.log (because WXT silently succeeds during build).
**Why it happens:** WXT imports entrypoint files to extract their configuration (matches, permissions, etc.) during the build process. Side effects in module scope run in Node.
**How to avoid:** ALL runtime code goes inside the `main()` function or `defineBackground(() => { ... })` callback. Module-level code is for imports and type definitions only.
**Warning signs:** `ReferenceError: browser is not defined` during build. Code runs once at build time but not at runtime.

### Pitfall 4: Missing host_permissions for x402 Endpoints
**What goes wrong:** The service worker's `fetch()` call to `https://llmogevm.opengradient.ai` returns a CORS error or is blocked entirely. The x402 flow never starts.
**Why it happens:** MV3 service workers bypass CORS only for domains listed in `host_permissions`. Without declaring the OpenGradient endpoint, the browser blocks the cross-origin request.
**How to avoid:** Add both `https://llmogevm.opengradient.ai/*` and `https://rpc.opengradient.ai/*` to `host_permissions` in `wxt.config.ts`. The RPC URL is needed because `viem` makes RPC calls for nonce management and transaction submission.
**Warning signs:** Network tab shows blocked requests or CORS errors to OpenGradient domains.

### Pitfall 5: Insufficient OUSDC Balance
**What goes wrong:** The x402 payment signing succeeds, but the on-chain transfer fails because the wallet has no OUSDC tokens. The gateway returns a 402 error that looks like a protocol failure rather than a balance issue.
**Why it happens:** Developers set up the wallet and private key but forget to fund it with OUSDC on OpenGradient's chain (ID: 10744).
**How to avoid:** Before running the spike: (1) create a wallet or use an existing one, (2) get OUSDC from OpenGradient's testnet faucet at `https://faucet.opengradient.ai`, (3) verify balance on `https://explorer.opengradient.ai`. Add a balance check to the spike test that runs before the first x402 call.
**Warning signs:** 402 responses that persist even after the payment header is included.

## Code Examples

### Complete WXT Configuration for Phase 1
```typescript
// wxt.config.ts
// Source: WXT docs (https://wxt.dev/guide/essentials/config/manifest)
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'OpenGradient Task Assistant',
    description: 'AI-powered task extraction with TEE-verified privacy',
    version: '0.1.0',
    permissions: [
      'storage',        // For chrome.storage.local and session
      'activeTab',      // Temporary tab access on user click
    ],
    host_permissions: [
      'https://llmogevm.opengradient.ai/*',  // OpenGradient x402 LLM gateway
      'https://rpc.opengradient.ai/*',       // OpenGradient RPC for viem
    ],
  },
});
```

### Complete x402 Client for Service Worker
```typescript
// lib/opengradient.ts
// Source: OpenGradient x402 examples (https://docs.opengradient.ai/developers/x402/examples)
import { wrapFetch } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// OpenGradient chain definition
const OG_CHAIN = {
  id: 10744,
  name: "OpenGradient",
  nativeCurrency: { name: "OG", symbol: "OG", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.opengradient.ai"] } },
} as const;

const OG_LLM_ENDPOINT = "https://llmogevm.opengradient.ai/v1/chat/completions";

/**
 * Create an x402-wrapped fetch client with the given private key.
 * The returned function works like native fetch() but auto-handles
 * 402 Payment Required responses by signing EIP-712 payment proofs.
 */
export function createX402Client(privateKey: `0x${string}`) {
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

/**
 * Make a test LLM call to validate the x402 integration.
 * Uses a cheap model (gpt-4o) with minimal tokens to minimize cost.
 */
export async function testLLMCall(x402Fetch: typeof fetch): Promise<{
  success: boolean;
  content?: string;
  model?: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  error?: string;
}> {
  try {
    const response = await x402Fetch(OG_LLM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o",
        messages: [
          { role: "user", content: "Respond with exactly: x402 connection verified" },
        ],
        max_tokens: 20,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${text}` };
    }

    const data = await response.json();
    return {
      success: true,
      content: data.choices?.[0]?.message?.content,
      model: data.model,
      usage: data.usage,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
```

### Service Worker with x402 Spike Handler
```typescript
// entrypoints/background.ts
// Source: WXT docs + OpenGradient x402 pattern
import { createX402Client, testLLMCall } from '@/lib/opengradient';

export default defineBackground(() => {
  console.log('[background] Service worker started');

  // Log lifecycle events for debugging
  browser.runtime.onInstalled.addListener((details) => {
    console.log('[background] Installed:', details.reason);
  });

  // Message handler: single entry point for all popup/content script messages
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    console.log('[background] Received message:', message.type);

    if (message.type === 'TEST_X402') {
      (async () => {
        try {
          // Read private key from session storage (never hardcode!)
          const { ogPrivateKey } = await chrome.storage.session.get('ogPrivateKey');
          if (!ogPrivateKey) {
            sendResponse({ success: false, error: 'No private key configured. Enter it in the popup.' });
            return;
          }

          const x402Fetch = createX402Client(ogPrivateKey as `0x${string}`);
          const result = await testLLMCall(x402Fetch);
          sendResponse(result);
        } catch (err: unknown) {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
      return true; // Keep message channel open for async sendResponse
    }

    if (message.type === 'SAVE_PRIVATE_KEY') {
      chrome.storage.session.set({ ogPrivateKey: message.key })
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (message.type === 'PING') {
      sendResponse({ status: 'alive', timestamp: Date.now() });
    }
  });
});
```

### Minimal Popup with Key Input and Test Button
```tsx
// entrypoints/popup/App.tsx
import { useState, useEffect } from 'react';

type TestResult = {
  success: boolean;
  content?: string;
  model?: string;
  error?: string;
};

export default function App() {
  const [privateKey, setPrivateKey] = useState('');
  const [keyStored, setKeyStored] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  useEffect(() => {
    // Check if key already stored in session
    chrome.storage.session.get('ogPrivateKey').then(({ ogPrivateKey }) => {
      if (ogPrivateKey) setKeyStored(true);
    });
  }, []);

  const saveKey = async () => {
    if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
      setResult({ success: false, error: 'Invalid private key format (must be 0x + 64 hex chars)' });
      return;
    }
    const response = await browser.runtime.sendMessage({
      type: 'SAVE_PRIVATE_KEY',
      key: privateKey,
    });
    if (response.success) {
      setKeyStored(true);
      setPrivateKey(''); // Clear from UI immediately
    }
  };

  const testX402 = async () => {
    setTesting(true);
    setResult(null);
    try {
      const response = await browser.runtime.sendMessage({ type: 'TEST_X402' });
      setResult(response);
    } catch (err) {
      setResult({ success: false, error: String(err) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ width: 380, padding: 16, fontFamily: 'system-ui' }}>
      <h2>OpenGradient Task Assistant</h2>

      {!keyStored ? (
        <div>
          <p>Enter your OpenGradient wallet private key:</p>
          <input
            type="password"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            placeholder="0x..."
            style={{ width: '100%', padding: 8, marginBottom: 8 }}
          />
          <button onClick={saveKey}>Save Key (session only)</button>
          <p style={{ fontSize: 12, color: '#666' }}>
            Key is stored in memory only. It will be cleared when you close the browser.
          </p>
        </div>
      ) : (
        <div>
          <p>Wallet key configured (session storage)</p>
          <button onClick={testX402} disabled={testing}>
            {testing ? 'Testing...' : 'Test x402 Gateway'}
          </button>
        </div>
      )}

      {result && (
        <div style={{
          marginTop: 12,
          padding: 12,
          backgroundColor: result.success ? '#e8f5e9' : '#fce4ec',
          borderRadius: 4,
        }}>
          <strong>{result.success ? 'SUCCESS' : 'FAILED'}</strong>
          <p>{result.success ? result.content : result.error}</p>
          {result.model && <p style={{ fontSize: 12 }}>Model: {result.model}</p>}
        </div>
      )}
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manifest V2 background pages | MV3 service workers | June 2025 (MV2 fully unsupported) | Service workers terminate after 30s idle. Design for event-driven, not persistent. |
| `chrome.browserAction` | `chrome.action` | MV3 | WXT handles this automatically. Just create `entrypoints/popup/index.html`. |
| `window.localStorage` | `chrome.storage.local` / `chrome.storage.session` | MV3 | localStorage unavailable in service workers. session storage (Chrome 102+) is in-memory only. |
| `setTimeout` / `setInterval` | `chrome.alarms` | MV3 | Timers die with service worker. Alarms survive. Minimum period: 30 seconds (Chrome 120+). |
| `chrome.tabs.executeScript` | `chrome.scripting.executeScript` | MV3 | WXT handles this for content scripts defined in entrypoints. |
| Service worker hard 5-min kill | Events reset idle timer (Chrome 110+) | Feb 2023 | Workers stay alive as long as they're processing events. Extension API calls reset the 30s idle timer. |
| One offscreen doc with auto-close | Per-reason lifetime rules | Chrome 109+ | Offscreen docs with most reasons persist until explicitly closed. Only AUDIO_PLAYBACK auto-closes after 30s silence. |

**Deprecated/outdated:**
- **Manifest V2:** Completely unsupported across all major browsers since June 2025. Chrome Web Store rejects MV2 submissions.
- **`chrome.browserAction` / `chrome.pageAction`:** Replaced by unified `chrome.action` in MV3.
- **Persistent background pages:** Don't exist in MV3. Service workers are event-driven.

## Open Questions

1. **@x402/fetch in MV3 Service Worker: Does it work?**
   - What we know: `@x402/fetch` wraps native `fetch()`. MV3 service workers have `fetch()`. `viem` (used for signing) supports all modern browsers. No Node.js-specific APIs are documented in the x402 client packages.
   - What's unclear: No one has documented this specific combination. The x402 flow involves an initial request -> 402 response -> payment signing -> resubmission. All of this should be transparent via the `wrapFetch` wrapper, but there could be edge cases with how Chrome handles the 402 redirect internally.
   - Recommendation: **This IS the Phase 1 spike.** Build it first, test it first. Budget 2-4 hours for the spike. If it fails, the fallback is a thin Python FastAPI proxy.
   - **Confidence: LOW** (until validated by the spike)

2. **Exact @x402/fetch import paths in bundler context**
   - What we know: The official example uses `import { wrapFetch } from "@x402/fetch"` and `import { ExactEvmScheme } from "@x402/evm/exact/client"`. These are valid npm package paths.
   - What's unclear: WXT uses Vite under the hood. Vite should resolve these imports correctly, but if the packages use CommonJS internally or have Node.js shims, there could be build errors.
   - Recommendation: If Vite build fails, try adding the packages to `optimizeDeps.include` in the WXT Vite config. If that fails, check if the packages export ESM builds.
   - **Confidence: MEDIUM**

3. **OUSDC token acquisition for testing**
   - What we know: OpenGradient has a testnet faucet at `https://faucet.opengradient.ai` and a block explorer at `https://explorer.opengradient.ai`. OUSDC token contract is `0x48515A4b24f17cadcD6109a9D85a57ba55a619a6` on chain 10744.
   - What's unclear: How much OUSDC does a single LLM call cost? How much does the faucet dispense? Is the faucet reliable / rate-limited?
   - Recommendation: Visit the faucet and fund the wallet before starting the spike. Check the block explorer for typical transaction costs.
   - **Confidence: MEDIUM**

4. **viem RPC calls from service worker**
   - What we know: `viem` creates a `walletClient` with an HTTP transport to `https://rpc.opengradient.ai`. This transport uses `fetch()` internally for JSON-RPC calls.
   - What's unclear: Does `viem`'s HTTP transport work in a service worker context? It should (it uses `fetch`), but the specific RPC calls made during x402 payment signing (nonce lookup, transaction broadcast) have not been tested from this context.
   - Recommendation: Include `https://rpc.opengradient.ai/*` in `host_permissions`. If RPC calls fail, check for missing permissions first.
   - **Confidence: MEDIUM**

5. **Settlement mode for the spike**
   - What we know: Three modes available: `SETTLE_INDIVIDUAL` (default, hashes only), `SETTLE_INDIVIDUAL_WITH_METADATA` (full data), `SETTLE_BATCH` (aggregated). The spike just needs to prove the connection works.
   - What's unclear: Does the default settlement mode work out of the box, or must the `X-SETTLE` header be explicitly set?
   - Recommendation: Use the default (no `X-SETTLE` header) for the spike. Add metadata settlement in Phase 2 when TEE verification badges need the full attestation data.
   - **Confidence: HIGH**

## Sources

### Primary (HIGH confidence)
- [WXT Framework Official Docs](https://wxt.dev/) - Entrypoints, project structure, manifest configuration, installation
- [WXT GitHub](https://github.com/wxt-dev/wxt) - v0.20.17, 9.2k+ stars, active maintenance
- [OpenGradient x402 Documentation](https://docs.opengradient.ai/developers/x402/) - Gateway endpoint, models, payment flow, chain details
- [OpenGradient x402 API Reference](https://docs.opengradient.ai/developers/x402/api-reference) - Full endpoint spec, headers, error codes, settlement modes
- [OpenGradient x402 Examples](https://docs.opengradient.ai/developers/x402/examples) - Complete TypeScript code for x402 client setup
- [Chrome Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) - Termination timers, event handling, idle behavior
- [Chrome Longer ESW Lifetimes (Chrome 110+)](https://developer.chrome.com/blog/longer-esw-lifetimes) - Updated timer behavior, API calls reset idle timer
- [Chrome Offscreen API Reference](https://developer.chrome.com/docs/extensions/reference/api/offscreen) - Reason enum, lifetime rules, communication patterns
- [Viem Platform Compatibility](https://viem.sh/docs/compatibility) - All modern browsers supported, tree-shakable

### Secondary (MEDIUM confidence)
- [@x402/fetch npm](https://www.npmjs.com/package/@x402/fetch) - v2.1.0, wraps native fetch for 402 handling
- [x402 Protocol](https://www.x402.org/ecosystem) - Payment standard overview, ecosystem
- [Coinbase x402 GitHub](https://github.com/coinbase/x402) - TypeScript client packages, repository structure
- [WXT React Module](https://www.npmjs.com/package/@wxt-dev/module-react) - v1.1.5+, React integration for WXT

### Tertiary (LOW confidence -- needs validation by spike)
- @x402/fetch + MV3 service worker compatibility -- no documented community usage found
- viem HTTP transport in service worker context -- should work but untested in this specific combination
- OpenGradient faucet (`https://faucet.opengradient.ai`) reliability and dispense amounts -- not documented publicly

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - WXT, React, TypeScript, viem are well-documented with version-pinned examples
- Architecture: HIGH - MV3 extension patterns are standard. WXT automates manifest and entrypoint wiring.
- x402 integration: LOW - Novel pattern. `@x402/fetch` + `viem` in MV3 service worker has zero community precedent. This IS the spike.
- Pitfalls: HIGH - Service worker lifecycle, credential security, and permission management are extensively documented by Chrome and OWASP.

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (30 days -- stack is stable; x402 library may update)

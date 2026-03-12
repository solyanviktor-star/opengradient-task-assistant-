# OpenGradient Task Assistant

AI-powered browser extension that extracts tasks, reminders, and commitments from any content using [OpenGradient](https://opengradient.ai) verifiable AI inference with x402 micropayments.

## Features

- **Text extraction** — copy any text, click "Extract from Clipboard" → AI finds tasks, deadlines, reminders
- **Voice input** — press the mic button, speak → Whisper transcribes → AI extracts tasks
- **Screenshot/OCR** — paste a screenshot (Ctrl+V) → Tesseract.js reads text → AI extracts tasks
- **Smart categorization** — AI assigns types (task, meeting, reminder, note, bookmark, credential, etc.)
- **Reminders** — set reminders on any task, get Chrome notifications even with the browser minimized
- **Fuzzy search** — search across all tasks with Fuse.js
- **Export** — download tasks as JSON or CSV
- **MemSync** (optional) — sync tasks to OpenGradient's AI memory layer for cross-device access
- **Tag learning** — AI learns your tag preferences over time

## How It Works

```
User Input (text/voice/screenshot)
    ↓
[Whisper transcription] ← only for voice (Groq, free)
[Tesseract.js OCR]      ← only for screenshots (local, offline)
    ↓
Text → x402 payment (0.05 OPG) → OpenGradient TEE → Claude Sonnet → JSON tasks
    ↓
Saved to chrome.storage.local (+ MemSync if configured)
```

All AI inference runs inside OpenGradient's **Trusted Execution Environment (TEE)** — hardware-isolated processing where even server administrators cannot see your data.

Payment is automatic via **x402 protocol** — each request costs ~0.05 OPG tokens on Base Sepolia testnet.

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Get your OPG tokens (free, testnet)

You need OPG tokens on **Base Sepolia** testnet to pay for AI requests.

**Get a wallet private key:**
- Use MetaMask → create/import account → Settings → Accounts → Export Private Key
- Or any EVM-compatible wallet

**Get free OPG tokens:**
- Go to the [OpenGradient Faucet](https://faucet.opengradient.ai)
- Enter your wallet address
- Claim OPG tokens (5-hour cooldown between claims)
- Each claim gives enough for ~40+ requests

### 3. Approve OPG for x402 (first time only)

Before x402 payments work, you need to approve the OPG token for Permit2 spending:

```bash
pip install opengradient
```

```python
import opengradient as og

client = og.init(private_key="0xYOUR_PRIVATE_KEY_HERE")
approval = client.llm.ensure_opg_approval(opg_amount=5.0)
print("Approval:", approval)
```

### 4. Get a Groq API key (free, for voice input)

Voice input uses [Groq](https://console.groq.com) for Whisper transcription (free tier).

1. Go to [console.groq.com](https://console.groq.com)
2. Sign up / log in
3. Go to **API Keys** → Create new key
4. Copy the key (starts with `gsk_`)

### 5. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
```
VITE_GROQ_KEY=gsk_your_actual_groq_key_here
```

### 6. Build the extension

```bash
npx wxt build
```

The built extension will be in `.output/chrome-mv3/`.

### 7. Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `.output/chrome-mv3/` folder

### 8. Configure the extension

1. Click the extension icon in Chrome toolbar
2. Paste your **wallet private key** (stored locally in chrome.storage, never sent anywhere)
3. Done! Start extracting tasks

---

## OpenGradient x402 — How It Works

### What is x402?

x402 is a payment protocol for AI API calls using cryptocurrency. Instead of monthly subscriptions or API keys, you pay per-request with crypto tokens.

### Payment flow

```
1. Extension sends request to OpenGradient LLM endpoint
2. Server responds with HTTP 402 (Payment Required) + payment details
3. @x402/fetch library auto-signs a Permit2 transaction (~0.05 OPG)
4. Request is retried with payment signature
5. Server verifies payment, runs AI inference in TEE, returns result
```

### Network details

| Parameter | Value |
|-----------|-------|
| Network | Base Sepolia (Chain ID: 84532) |
| OPG Token | `0x240b09731D96979f50B2C649C9CE10FcF9C7987F` |
| Permit2 | `0xA2820a4d4F3A8c5Fa4eaEBF45B093173105a8f8F` |
| Upto Proxy | `0xdB9F7863C9E06Daf21aD43663a06a2f43d303Fa7` |
| Cost per request | ~0.05 OPG |
| Faucet | https://faucet.opengradient.ai |

---

## Connecting OpenGradient API from Your Code

### Endpoint

```
POST https://og-proxy-production.up.railway.app/v1/chat/completions
```

> **Note:** This is a community proxy needed because OpenGradient's TEE server uses a self-signed TLS certificate that browsers reject. The proxy forwards requests to the TEE. Once OpenGradient provides a browser-trusted certificate, the extension will connect directly.

### TypeScript example

```typescript
import { wrapFetch } from "@x402/fetch";
import { UptoEvmScheme } from "@x402/evm";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// 1. Create wallet client
const account = privateKeyToAccount("0xYOUR_PRIVATE_KEY");
const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(),
});

// 2. Create x402-enabled fetch
const paymentScheme = new UptoEvmScheme(walletClient);
const x402Fetch = wrapFetch(fetch, paymentScheme);

// 3. Make LLM request — payment is automatic
const response = await x402Fetch(
  "https://og-proxy-production.up.railway.app/v1/chat/completions",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer dummy-key",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello!" },
      ],
      max_tokens: 200,
    }),
  }
);

const data = await response.json();
console.log(data.choices[0].message.content);
```

### Python example

```python
import opengradient as og

client = og.init(private_key="0xYOUR_PRIVATE_KEY")

response = client.llm.chat(
    model=og.TEE_LLM.CLAUDE_3_5_HAIKU,
    messages=[{"role": "user", "content": "Extract tasks from: Buy groceries tomorrow"}],
    max_tokens=500,
)
print(response.chat_output)
```

### Available models

| Model ID | Provider | Status |
|----------|----------|--------|
| `claude-sonnet-4-20250514` | Anthropic | Working |
| `openai/gpt-4o` | OpenAI | Working |
| `meta-llama/Llama-3.3-70B-Instruct` | Meta | Working |
| `deepseek-ai/DeepSeek-V3` | DeepSeek | Working |
| `Qwen/Qwen2.5-72B-Instruct` | Qwen | Working |
| `mistralai/Mistral-Small-24B-Instruct-2501` | Mistral | Working |

> **Note:** Vision/multimodal is NOT supported on TEE. Image inputs return empty responses. Use OCR (Tesseract.js) to extract text from images first.

### Getting more OPG tokens

**Faucet API:**
```bash
curl -X POST https://faucet.opengradient.ai/api/claim \
  -H "Content-Type: application/json" \
  -d '{"address": "0xYOUR_WALLET_ADDRESS"}'
```

5-hour cooldown between claims.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  Chrome Extension (popup + background)       │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │ Clipboard │  │  Voice   │  │ Screenshot│ │
│  │   Text    │  │  Input   │  │   OCR     │ │
│  └─────┬─────┘  └────┬─────┘  └─────┬─────┘ │
│        │              │              │        │
│        │         Groq Whisper   Tesseract.js  │
│        │         (free, cloud)  (local, WASM) │
│        │              │              │        │
│        └──────────────┼──────────────┘        │
│                       ↓                       │
│              x402 Payment + LLM               │
│         (OpenGradient TEE via proxy)          │
│                       ↓                       │
│              chrome.storage.local             │
│              (+ MemSync optional)             │
└─────────────────────────────────────────────┘
```

### Key files

| File | Description |
|------|-------------|
| `lib/opengradient.ts` | x402 client, LLM calls, Whisper transcription |
| `lib/task-extractor.ts` | System prompt, JSON parser, date injection |
| `lib/memsync.ts` | MemSync REST client (optional cloud sync) |
| `lib/storage.ts` | chrome.storage.local CRUD operations |
| `lib/search.ts` | Fuse.js fuzzy search |
| `lib/types.ts` | TypeScript interfaces |
| `entrypoints/background.ts` | Service worker — message handlers, alarms, voice |
| `entrypoints/popup/App.tsx` | Main UI — extraction, OCR, tabs, export |
| `entrypoints/popup/components/KeySetup.tsx` | Wallet setup, OPG balance, faucet |
| `wxt.config.ts` | WXT/manifest configuration |

### Tech stack

- [WXT](https://wxt.dev) — Chrome Extension framework (Vite-based)
- [React](https://react.dev) + [Tailwind CSS](https://tailwindcss.com) — UI
- [@x402/fetch](https://www.npmjs.com/package/@x402/fetch) + [@x402/evm](https://www.npmjs.com/package/@x402/evm) — x402 payment protocol
- [viem](https://viem.sh) — Ethereum wallet/signing
- [Tesseract.js](https://tesseract.projectnaptha.com) v7 — offline OCR (rus+eng)
- [Fuse.js](https://www.fusejs.io) — fuzzy search
- [Groq](https://groq.com) Whisper — voice transcription

---

## MemSync (Optional)

[MemSync](https://memsync.ai) is OpenGradient's universal AI memory layer. When configured, tasks automatically sync to the cloud:

- Cross-device task access
- AI memory that works across ChatGPT, Claude, and other assistants
- Semantic search across all your memories

### Setup:
1. Go to [app.memsync.ai/dashboard/api-keys](https://app.memsync.ai/dashboard/api-keys)
2. Create an API key
3. Paste it in the MemSync field in the extension
4. Tasks will auto-sync after each extraction

---

## Development

```bash
# Dev mode with hot reload
npx wxt dev

# Production build
npx wxt build

# Build for Firefox
npx wxt build --browser firefox
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Insufficient balance" | Claim OPG from faucet (5h cooldown) |
| x402 payment loops | Run `ensure_opg_approval()` via Python SDK |
| Voice not working | Check `VITE_GROQ_KEY` in `.env`, rebuild |
| OCR not loading | Verify `public/tesseract/` has all 4 files |
| Screenshots stuck on "Processing" | Use Ctrl+V in popup window |
| Wrong dates from AI | Automatic — system prompt injects current date |

---

## License

MIT

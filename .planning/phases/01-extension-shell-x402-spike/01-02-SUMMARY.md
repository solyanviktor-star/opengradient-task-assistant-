---
phase: 01-extension-shell-x402-spike
plan: 02
subsystem: x402-gateway
tags: [x402, permit2, viem, opengradient, upto-scheme, base-sepolia, eip712]

# Dependency graph
requires: [01-01]
provides:
  - Working x402 payment flow from MV3 service worker to OpenGradient LLM
  - Custom UptoEvmScheme implementation for OG's non-standard Permit2 contracts
  - Private key storage in chrome.storage.session (ephemeral)
  - Popup UI with key entry and x402 gateway test button
affects: [phase-02]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Custom UptoEvmScheme with OG Permit2 contracts", "x402 upto payment scheme with witness transfer", "EIP-712 typed data signing via viem", "chrome.storage.session for ephemeral key storage"]

key-files:
  created:
    - lib/opengradient.ts
  modified:
    - entrypoints/background.ts
    - entrypoints/popup/App.tsx
    - wxt.config.ts

key-decisions:
  - "OpenGradient uses custom Permit2 (0xA2820a4d4F3A8c5Fa4eaEBF45B093173105a8f8F) and Upto Proxy (0xdB9F7863C9E06Daf21aD43663a06a2f43d303Fa7) -- NOT standard x402/Uniswap addresses"
  - "Payment chain is Base Sepolia (eip155:84532) with $OPG token (0x240b09731D96979f50B2C649C9CE10FcF9C7987F)"
  - "LLM endpoint changed from llmogevm.opengradient.ai to llm.opengradient.ai"
  - "Authorization header with placeholder Bearer token required by OG server"
  - "X-SETTLEMENT-TYPE: settle-batch header required for batch settlement mode"
  - "Implemented UptoEvmScheme from scratch -- @x402/evm only provides ExactEvmScheme, OG requires 'upto' scheme"

patterns-established:
  - "OG x402 flow: wrapFetchWithPayment intercepts 402 -> UptoEvmScheme signs Permit2 -> retry with PAYMENT-SIGNATURE header"
  - "Permit2 witness types: PermitWitnessTransferFrom, TokenPermissions, Witness (to, validAfter, extra)"
  - "Random 256-bit nonce via crypto.getRandomValues for each payment"
  - "x402Client registers both exact and upto schemes for Base Sepolia"

# Metrics
duration: ~3 sessions (multi-day spike with debugging)
completed: 2026-03-01
---

# Phase 1 Plan 2: x402 Gateway Spike Summary

**SPIKE VERDICT: PASS -- x402 payment-gated LLM calls work from MV3 service worker. Architecture validated.**

## Performance

- **Duration:** ~3 sessions (spike involved significant debugging of OG's non-standard x402 implementation)
- **Completed:** 2026-03-01
- **Tasks:** 2 (1 auto + 1 human-verify checkpoint)
- **Files created:** 1
- **Files modified:** 3

## Accomplishments

- Created `lib/opengradient.ts` with `createX402Client` and `testLLMCall` functions
- Implemented custom `UptoEvmScheme` class with EIP-712 Permit2 signing targeting OG's custom contracts
- Wired service worker message handlers (SAVE_PRIVATE_KEY, TEST_X402) in background.ts
- Built popup UI with private key input, session storage, and test button in App.tsx
- Updated host_permissions to correct endpoint (llm.opengradient.ai)
- Extension successfully calls OpenGradient's TEE-verified GPT-4o endpoint via x402 payment

## Task Commits

Each task was committed atomically:

1. **Task 1: Create x402 client library and wire service worker** - `b981ec9` (feat), `8cabb59` (fix: Base Sepolia chain)
2. **Task 2: Human verification - x402 gateway validated** - `25a994b` (feat: upto scheme with OG custom contracts)

## Files Created/Modified

- `lib/opengradient.ts` - x402 client library with UptoEvmScheme, createX402Client, testLLMCall
- `entrypoints/background.ts` - Added SAVE_PRIVATE_KEY and TEST_X402 message handlers
- `entrypoints/popup/App.tsx` - Private key input, session storage, test button, result display
- `wxt.config.ts` - Fixed host_permissions to llm.opengradient.ai

## Decisions Made

- **OG uses custom contracts**: Discovered via Python SDK (`x402v2` package) that OpenGradient deploys their own Permit2 and proxy contracts, completely different from standard x402/Uniswap addresses
- **"upto" scheme required**: OG's server expects the "upto" payment scheme, not "exact". Had to implement UptoEvmScheme from scratch since @x402/evm only provides ExactEvmScheme
- **Base Sepolia (84532)**: Payment chain is Base Sepolia, not OpenGradient chain (10744) as originally planned
- **Placeholder Auth header**: Server requires `Authorization: Bearer 0x1234...` placeholder
- **Batch settlement**: `X-SETTLEMENT-TYPE: settle-batch` header required

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Payment chain changed from OpenGradient (10744) to Base Sepolia (84532)**
- **Found during:** Task 1 (x402 client creation)
- **Issue:** Original plan assumed OG chain 10744, but server's 402 response requires eip155:84532
- **Fix:** Changed chain registration and endpoint configuration to Base Sepolia
- **Commit:** `8cabb59`

**2. [Rule 3 - Blocking] OG uses custom Permit2 contracts, not standard x402 addresses**
- **Found during:** Task 2 (end-to-end testing)
- **Issue:** Server returned `invalid_upto_permit2_spender` -- standard x402 proxy addresses rejected
- **Fix:** Reverse-engineered Python SDK to find correct addresses: Permit2=0xA2820a4d4F3A8c5Fa4eaEBF45B093173105a8f8F, Proxy=0xdB9F7863C9E06Daf21aD43663a06a2f43d303Fa7
- **Commit:** `25a994b`

**3. [Rule 1 - Bug] Missing Authorization and X-SETTLEMENT-TYPE headers**
- **Found during:** Task 2 (end-to-end testing)
- **Issue:** Server returned 401 without Auth header; settlement mode not specified
- **Fix:** Added both headers matching Python SDK behavior
- **Commit:** `25a994b`

**4. [Rule 2 - Non-blocking] Endpoint URL changed**
- **Found during:** Task 1
- **Issue:** Endpoint changed from llmogevm.opengradient.ai to llm.opengradient.ai
- **Fix:** Updated both lib/opengradient.ts and wxt.config.ts host_permissions
- **Commit:** `25a994b`

---

**Total deviations:** 4 auto-fixed (1 bug, 3 blocking)
**Impact on plan:** Significant debugging effort, but spike still PASSED. All deviations related to OG's non-standard x402 implementation vs. plan assumptions based on standard x402 docs.

## Issues Encountered

- **Temporary 500/503 from OG backend**: After payment was accepted (confirmed by x-upto-session header), OG's LLM backend returned 500/503 temporarily. Resolved after server recovery.
- **Testnet ETH bridging**: Required bridging Ethereum Sepolia ETH to Base Sepolia via superbridge.app.

## User Setup Required

Completed during spike:
- Funded wallet with Base Sepolia ETH (via faucet + bridge)
- Approved OG's custom Permit2 contract to spend $OPG tokens (via approve-opg.mjs)

## Key Discovery: OG Contract Addresses

| Contract | Standard x402 | OpenGradient Custom |
|----------|---------------|---------------------|
| Permit2 | 0x000000000022D473030F116dDEE9F6B43aC78BA3 | 0xA2820a4d4F3A8c5Fa4eaEBF45B093173105a8f8F |
| Upto Proxy | 0x4020633461b2895a48930Ff97eE8fCdE8E520002 | 0xdB9F7863C9E06Daf21aD43663a06a2f43d303Fa7 |
| Payment Token | USDC | $OPG (0x240b09731D96979f50B2C649C9CE10FcF9C7987F) |
| Chain | Base Mainnet | Base Sepolia (84532) |

## Next Phase Readiness

- x402 gateway PROVEN WORKING from MV3 service worker
- Architecture validated: @x402/fetch + viem + custom UptoEvmScheme + Chrome service worker
- Ready for Phase 2: content extraction + AI inference + task storage pipeline
- testLLMCall confirms GPT-4o model access via OG endpoint with TEE verification

## Self-Check: PASSED

All 3 commits verified: b981ec9, 8cabb59, 25a994b. Extension builds, installs, and successfully completes x402 payment flow with LLM response.

---
*Phase: 01-extension-shell-x402-spike*
*Completed: 2026-03-01*
*SPIKE VERDICT: PASS*

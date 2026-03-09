# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-14)

**Core value:** Automatically capture action items from any web content and remind users at the right time, with cryptographic proof of privacy through TEE.
**Current focus:** Phase 4 -- Notification + Polish

## Current Position

Phase: 3 of 4 (Task UI + Privacy Verification) -- COMPLETE
Plan: 2 of 2 in current phase (DONE)
Status: Phase 3 COMPLETE. All plans done. Ready for Phase 4.
Last activity: 2026-03-09 -- Completed 03-02 Privacy Verification Badges

Progress: [████████░░] 80%

## Performance Metrics

**Velocity:**
- Total plans completed: 7
- Total execution time: ~6 sessions

**By Phase:**

| Phase | Plans | Status |
|-------|-------|--------|
| 01-extension-shell-x402-spike | 2/2 | Complete |
| 02-extraction-ai-storage-pipeline | 3/3 | Complete |
| 03-task-ui-privacy-verification | 2/2 | Complete |

## Accumulated Context

### Decisions

- [Roadmap]: x402 HTTP gateway chosen over Python SDK (no JS SDK exists, x402 is HTTP-native)
- [Roadmap]: Local storage only -- MemSync removed (user decision)
- [02-03]: Clipboard extraction instead of content scripts (user: "browser Telegram is pointless")
- [02-03]: MemSync deleted entirely -- chrome.storage.local only
- [02-03]: Local Node.js proxy required -- TEE server uses self-signed AWS Nitro cert, Chrome can't bypass SSL
- [02-03]: OCR on proxy via Tesseract.js -- TEE server doesn't support vision/multimodal
- [02-03]: Endpoint migrated from llm.opengradient.ai to 3.15.214.21:443 (DNS removed)
- [02-03]: Models renamed: claude-sonnet-4-6, gpt-4.1-2025-04-14 (no provider prefix)
- [02-03]: Settlement mode: "batch" (not "individual") matching SDK default
- [02-03]: Private key in chrome.storage.local (persistent, not session)
- [01-02]: OG uses custom Permit2 contracts, NOT standard x402/Uniswap addresses
- [01-02]: Payment chain is Base Sepolia (84532) with $OPG token
- [01-02]: "upto" scheme required -- implemented custom UptoEvmScheme
- [03-01]: Optimistic UI for task complete/delete -- instant state update, fire-and-forget to background
- [03-01]: Removed memsyncId/synced from Task type; backward compat in getLocalTasks for old stored tasks
- [03-01]: KeySetup manages own error state, separate from App.tsx extractResult
- [03-02]: VerifyBadge 2-tier display: green Verified (anchor to explorer) when txHash present, gray TEE (span) when null
- [03-02]: Changed handleDelete from fire-and-forget to async/await with rollback -- fire-and-forget was not persisting deletes

### Architecture Notes

- **Proxy** (`proxy.mjs`): Required for 2 reasons: (1) TEE SSL bypass, (2) OCR endpoint
- **Clipboard flow**: Button click → readText() for text; Ctrl+V paste event → proxy OCR → text
- **Models**: SDK strips provider prefix (openai/gpt-4.1... → gpt-4.1...)
- **x402 v2**: Python SDK uses `x402v2` package, JS uses `@x402/fetch` + `@x402/evm`
- **Popup components**: KeySetup, TaskCard, TaskList, VerifyBadge in `entrypoints/popup/components/`. All Tailwind, no inline styles.
- **VerifyBadge**: 2-tier badge -- green "Verified" links to `explorer.opengradient.ai/tx/{txHash}`, gray "TEE" when no txHash.

### Blockers/Concerns

- ~~x402 gateway + MV3 service worker compatibility~~ RESOLVED: PASS
- ~~MemSync auth bootstrapping~~ RESOLVED: MemSync removed
- TEE self-signed SSL requires proxy -- not ideal for distribution
- TEE doesn't support vision -- OCR workaround adds latency for screenshots

## Session Continuity

Last session: 2026-03-09
Stopped at: Completed 03-02-PLAN.md. Phase 3 complete. Task UI + Privacy Verification all done. Ready for Phase 4.
Resume file: None

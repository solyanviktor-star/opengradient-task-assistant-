# Roadmap: OpenGradient Task Assistant

## Overview

This roadmap delivers an AI-powered Chrome extension that extracts tasks from web content using OpenGradient's TEE-verified LLM and persists them via MemSync. The build progresses from a working extension shell with validated x402 gateway (highest risk), through the full extraction-to-storage pipeline, into the task management UI with privacy verification, and finishes with reminders and semantic search. Four phases, each delivering a vertically complete capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Extension Shell + x402 Spike** - Working MV3 extension that proves OpenGradient x402 gateway works from a service worker
- [ ] **Phase 2: Extraction + AI + Storage Pipeline** - End-to-end flow from page content to TEE-verified AI extraction to stored tasks
- [ ] **Phase 3: Task UI + Privacy Verification** - User-facing task management with TEE verification badges and on-chain proof display
- [ ] **Phase 4: Reminders + Search** - Push notification reminders and semantic search over stored tasks

## Phase Details

### Phase 1: Extension Shell + x402 Spike
**Goal**: User can install the extension and it successfully communicates with OpenGradient's x402 gateway, proving the core architecture works
**Depends on**: Nothing (first phase)
**Requirements**: EXTN-01, EXTN-02, EXTN-03, EXTN-04
**Success Criteria** (what must be TRUE):
  1. Extension installs in Chrome and the icon appears in the toolbar
  2. Clicking the extension icon opens a popup window (even if minimal/placeholder content)
  3. Service worker initializes and handles lifecycle events without crashing
  4. A test request to OpenGradient's x402 LLM endpoint returns a successful response from the service worker
**Plans**: TBD

Plans:
- [ ] 01-01: WXT project scaffold + Manifest V3 + service worker + popup shell
- [ ] 01-02: x402 gateway integration spike from service worker (validate or pivot)

### Phase 2: Extraction + AI + Storage Pipeline
**Goal**: User can trigger task extraction on a web page and get structured, TEE-verified tasks stored persistently
**Depends on**: Phase 1
**Requirements**: EXTR-01, EXTR-02, EXTR-03, EXTR-04, EXTR-05, AI-01, AI-02, AI-03, AI-04, AI-05, AI-06, AI-07, STOR-01, STOR-02, STOR-03, STOR-04, STOR-05
**Success Criteria** (what must be TRUE):
  1. User clicks the extension icon on Telegram Web and extracted tasks appear (end-to-end pipeline works)
  2. Each extracted task contains structured data: action text, deadline (if found), priority, context, and source URL
  3. Tasks survive browser restart (persist in both local cache and MemSync)
  4. Each AI inference returns a cryptographic attestation and on-chain transaction hash
  5. Content extraction works on at least one additional platform beyond Telegram Web
**Plans**: TBD

Plans:
- [ ] 02-01: Content scripts for Telegram Web + one additional platform
- [ ] 02-02: OpenGradient LLM integration with TEE-verified structured task extraction
- [ ] 02-03: Dual storage (chrome.storage.local + MemSync) with task persistence

### Phase 3: Task UI + Privacy Verification
**Goal**: User can view, manage, and verify the privacy of all their extracted tasks through the popup interface
**Depends on**: Phase 2
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, PRIV-01, PRIV-02, PRIV-03, PRIV-04
**Success Criteria** (what must be TRUE):
  1. Popup displays all tasks with action text, source attribution (clickable link), and deadline
  2. User can mark a task as complete and it visually changes to show completion state
  3. User can delete a task and it disappears from the list
  4. Each task shows a TEE verification badge indicating its cryptographic attestation status
  5. User can click a proof link on any task to view the on-chain transaction in OpenGradient's block explorer
**Plans**: TBD

Plans:
- [ ] 03-01: Task list popup UI with CRUD operations
- [ ] 03-02: Privacy verification badges and on-chain proof display

### Phase 4: Reminders + Search
**Goal**: User can set reminders on tasks and search through all stored tasks using natural language
**Depends on**: Phase 3
**Requirements**: NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, NOTIF-05, SRCH-01, SRCH-02, SRCH-03, SRCH-04
**Success Criteria** (what must be TRUE):
  1. User can set a reminder time on any task and receive a Chrome push notification at that time
  2. Notification shows the task action text and clicking it opens the task in the popup
  3. User can type a natural language query in the search box and see relevant tasks from MemSync semantic search
  4. Search works across content, person names, and topics
**Plans**: TBD

Plans:
- [ ] 04-01: chrome.alarms + chrome.notifications reminder system
- [ ] 04-02: Semantic search UI with MemSync integration

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Extension Shell + x402 Spike | 0/2 | Not started | - |
| 2. Extraction + AI + Storage Pipeline | 0/3 | Not started | - |
| 3. Task UI + Privacy Verification | 0/2 | Not started | - |
| 4. Reminders + Search | 0/2 | Not started | - |

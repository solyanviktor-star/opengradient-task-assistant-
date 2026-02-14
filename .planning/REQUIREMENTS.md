# Requirements: OpenGradient Task Assistant

**Defined:** 2026-02-14
**Core Value:** Automatically capture action items from any web content and remind users at the right time, with cryptographic proof of privacy through TEE.

## v1 Requirements

Requirements for MVP demo (5-7 days). Each maps to roadmap phases.

### Extension Foundation

- [ ] **EXTN-01**: Extension has valid Manifest V3 configuration
- [ ] **EXTN-02**: Service worker handles extension lifecycle events
- [ ] **EXTN-03**: Extension icon appears in Chrome toolbar
- [ ] **EXTN-04**: Popup UI opens when extension icon is clicked

### Content Extraction

- [ ] **EXTR-01**: Content script injects on Telegram Web
- [ ] **EXTR-02**: Content script extracts text from current page
- [ ] **EXTR-03**: User can trigger extraction via extension icon click
- [ ] **EXTR-04**: Extracted content is sent to AI processing pipeline
- [ ] **EXTR-05**: Content script works on at least one additional platform (Gmail or Slack)

### AI Task Processing

- [ ] **AI-01**: Service worker connects to OpenGradient LLM via x402 gateway
- [ ] **AI-02**: Extracted content is sent to Claude 4.0 Sonnet for analysis
- [ ] **AI-03**: LLM identifies action items from text
- [ ] **AI-04**: LLM extracts structured task data (action, deadline, priority, context)
- [ ] **AI-05**: AI inference runs in TEE-verified mode
- [ ] **AI-06**: Each inference produces cryptographic attestation
- [ ] **AI-07**: On-chain transaction hash is returned for each task extraction

### Task Storage

- [ ] **STOR-01**: Tasks are saved to MemSync API
- [ ] **STOR-02**: Tasks include type, action, deadline, priority, context, source URL
- [ ] **STOR-03**: Tasks persist across browser restarts
- [ ] **STOR-04**: Tasks are retrievable from MemSync
- [ ] **STOR-05**: Local cache in chrome.storage.local for offline access

### Task Management UI

- [ ] **UI-01**: Popup displays list of all tasks
- [ ] **UI-02**: Each task shows action text, source, and deadline (if available)
- [ ] **UI-03**: User can mark task as complete
- [ ] **UI-04**: User can delete task
- [ ] **UI-05**: Completed tasks are visually distinguished from pending tasks
- [ ] **UI-06**: Task list shows source attribution (link to original page)

### Privacy Verification

- [ ] **PRIV-01**: TEE verification badge displays on each task
- [ ] **PRIV-02**: User can view on-chain proof for any task
- [ ] **PRIV-03**: On-chain proof links to OpenGradient block explorer
- [ ] **PRIV-04**: Privacy badge shows cryptographic attestation status

### Reminders & Notifications

- [ ] **NOTIF-01**: User can set reminder time for any task
- [ ] **NOTIF-02**: chrome.alarms schedules reminders
- [ ] **NOTIF-03**: Push notification appears at reminder time
- [ ] **NOTIF-04**: Notification includes task action text
- [ ] **NOTIF-05**: Clicking notification opens task in popup

### Search

- [ ] **SRCH-01**: Search box in popup accepts natural language queries
- [ ] **SRCH-02**: Semantic search queries MemSync API
- [ ] **SRCH-03**: Search results display relevant tasks
- [ ] **SRCH-04**: User can search by content, person, or topic

## v2 Requirements

Deferred to post-MVP. Tracked but not in current roadmap.

### Enhanced Extraction

- **EXTR-06**: Content script works on Gmail
- **EXTR-07**: Content script works on Slack
- **EXTR-08**: Content script works on Discord
- **EXTR-09**: Content script works on article pages
- **EXTR-10**: Platform-specific parsing optimizations

### Advanced Task Management

- **UI-07**: User can manually create tasks
- **UI-08**: User can edit existing task text
- **UI-09**: User can edit task deadline
- **UI-10**: Tasks auto-categorize (work, personal, urgent)

### Integrations

- **INTG-01**: Export tasks to JSON
- **INTG-02**: Export tasks to CSV
- **INTG-03**: Google Calendar sync
- **INTG-04**: Telegram bot for reminders

### Polish

- **POL-01**: Settings page for API key configuration
- **POL-02**: Options for notification preferences
- **POL-03**: Dark mode UI theme
- **POL-04**: Offline mode with local-only operation

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time message monitoring | Privacy nightmare, constant API calls, massive scope. Manual trigger only. |
| Calendar integration (v1) | 2+ days of OAuth/API work. Show due dates in UI instead. |
| Mobile app | Separate platform, massive scope. MemSync enables future mobile. |
| Collaborative task sharing | Multiplayer is 10x complexity. Single-user MVP. |
| Natural language date parsing | Rabbit hole. Use simple date picker for manual tasks. |
| Browser history indexing | Privacy concerns, massive storage. Only extract from explicit trigger. |
| Offline AI inference | OpenGradient TEE IS the privacy story. Local inference not needed. |
| Multiple AI model selection | Confuses OpenGradient narrative. One model, verified. |
| Analytics/reporting | 1-2 days of frontend work for nice-to-have. Simple counts only. |
| Firefox support (v1) | Chrome first (60%+ market share). Firefox requires different manifest. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| EXTN-01 | TBD | Pending |
| EXTN-02 | TBD | Pending |
| EXTN-03 | TBD | Pending |
| EXTN-04 | TBD | Pending |
| EXTR-01 | TBD | Pending |
| EXTR-02 | TBD | Pending |
| EXTR-03 | TBD | Pending |
| EXTR-04 | TBD | Pending |
| EXTR-05 | TBD | Pending |
| AI-01 | TBD | Pending |
| AI-02 | TBD | Pending |
| AI-03 | TBD | Pending |
| AI-04 | TBD | Pending |
| AI-05 | TBD | Pending |
| AI-06 | TBD | Pending |
| AI-07 | TBD | Pending |
| STOR-01 | TBD | Pending |
| STOR-02 | TBD | Pending |
| STOR-03 | TBD | Pending |
| STOR-04 | TBD | Pending |
| STOR-05 | TBD | Pending |
| UI-01 | TBD | Pending |
| UI-02 | TBD | Pending |
| UI-03 | TBD | Pending |
| UI-04 | TBD | Pending |
| UI-05 | TBD | Pending |
| UI-06 | TBD | Pending |
| PRIV-01 | TBD | Pending |
| PRIV-02 | TBD | Pending |
| PRIV-03 | TBD | Pending |
| PRIV-04 | TBD | Pending |
| NOTIF-01 | TBD | Pending |
| NOTIF-02 | TBD | Pending |
| NOTIF-03 | TBD | Pending |
| NOTIF-04 | TBD | Pending |
| NOTIF-05 | TBD | Pending |
| SRCH-01 | TBD | Pending |
| SRCH-02 | TBD | Pending |
| SRCH-03 | TBD | Pending |
| SRCH-04 | TBD | Pending |

**Coverage:**
- v1 requirements: 39 total
- Mapped to phases: 0 (pending roadmap creation)
- Unmapped: 39 ⚠️

---
*Requirements defined: 2026-02-14*
*Last updated: 2026-02-14 after initial definition*

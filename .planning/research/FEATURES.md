# Feature Research

**Domain:** AI-powered browser extension for task extraction, persistent memory, and privacy-verified inference
**Researched:** 2026-02-14
**Confidence:** MEDIUM (based on WebSearch ecosystem survey + OpenGradient official docs; no Context7 verification available for OpenGradient/MemSync)

## Feature Landscape

### Table Stakes (Users Expect These)

Features the demo MUST have or it feels broken. These are non-negotiable for a credible demo to the OpenGradient community.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Task extraction from web content** | Core value proposition. Without this, there is no product. Users paste/view content, AI identifies action items. | MEDIUM | Use OpenGradient LLM inference to extract tasks from page text. Must handle Telegram web, Gmail web, Slack web, and general articles. Content script injects extractor on supported sites. |
| **Persistent task storage** | Users need tasks to survive browser restarts. Ephemeral tasks are useless. | LOW | Use MemSync as primary store (aligns with OpenGradient showcase). Fallback: chrome.storage.local for offline/fast access. |
| **Task list view (popup/sidebar)** | Users must see their tasks somewhere. Standard popup UI accessed from toolbar icon. | LOW | Manifest V3 popup or side panel. Show task title, source URL, due date if extracted, status (pending/done). |
| **Basic task management** | Mark complete, delete, edit. Without CRUD the demo feels like a toy. | LOW | Standard UI operations on stored tasks. |
| **Manual task creation** | Users will always want to add their own tasks beyond auto-extracted ones. | LOW | Simple input field in popup. Send to same storage pipeline. |
| **Push notification reminders** | Core promise of the product. Chrome extension push notifications via service worker are well-supported in MV3. | MEDIUM | Use chrome.alarms API + chrome.notifications API. Service worker wakes on alarm, shows notification. For tasks with extracted deadlines, auto-schedule. For others, user sets reminder time. |
| **Source attribution** | Users need to know WHERE a task came from (which message, which page). | LOW | Store source URL and snippet with each task. Link back to original content. |

### Differentiators (Competitive Advantage)

Features that showcase OpenGradient and make this project stand out to the community.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **TEE-verified AI inference** | The killer demo feature. Task extraction runs through OpenGradient's TEE mode, proving the AI processed your data privately. No other task extension can prove this. Directly showcases OpenGradient's core value prop. | MEDIUM | Use OpenGradient SDK with `TEE` inference mode instead of `VANILLA`. Each task extraction produces a verifiable attestation. Display verification badge on extracted tasks. |
| **On-chain proof of computation** | Every task extraction is a verifiable on-chain transaction. Users can independently verify their data was processed correctly without being leaked. This is the "web3 native" angle that impresses the OpenGradient community. | LOW (if TEE mode already implemented) | Comes "for free" with OpenGradient on-chain inference. Store transaction hash per task. Show proof link in task detail view. |
| **Semantic search over task memory** | Instead of keyword search, find tasks by meaning: "that thing about the deployment deadline" finds the right task even without exact words. Showcases MemSync's vector search. | MEDIUM | Use MemSync `search_memories` API with natural language query. Cross-encoder reranking provides precise results. Display in search UI within popup. |
| **Cross-platform memory persistence** | Tasks extracted in one context are available everywhere MemSync is connected. Your browser extension tasks could surface in ChatGPT/Claude via MemSync integration. | LOW | MemSync handles this natively. Just use consistent user_id. Mention in demo as future capability. |
| **Privacy verification badge** | Visual indicator on each task showing it was processed through TEE with a link to the on-chain attestation. Makes the privacy story tangible and demo-able. | LOW | UI component that reads attestation data stored with task. Links to OpenGradient block explorer for the transaction. |
| **Smart categorization** | AI automatically categorizes tasks (work, personal, urgent, follow-up) using MemSync's semantic/episodic memory distinction. | LOW | MemSync supports smart categories natively. Map to task labels/tags in UI. |
| **Context-aware extraction** | Different extraction strategies for different platforms: Telegram messages vs Gmail threads vs Slack channels vs article content. Understands platform-specific patterns. | MEDIUM | Platform-specific content scripts that pre-process DOM before sending to AI. Telegram: message bubbles. Gmail: email body. Slack: message thread. Articles: main content. |

### Anti-Features (Deliberately NOT Building for MVP)

Features that seem appealing but would sink the 5-7 day timeline or dilute the demo message.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Real-time message monitoring** | "Automatically scan all messages as they arrive" sounds magical. | Requires complex MutationObserver logic per platform, constant AI API calls, rate limiting, massive scope creep. Privacy nightmare for demo. | Manual trigger: user clicks extension icon or context menu to extract from current page. Deliberate, not surveillance. |
| **Calendar integration** | "Auto-add tasks to Google Calendar" is a common request. | Requires OAuth flow, Google Calendar API, complex scheduling logic. 2+ days of work for a secondary feature. | Show due dates in task list. Calendar sync is v2. |
| **Mobile app / cross-device sync** | "Access tasks on my phone." | Requires building a separate mobile app or PWA. Massive scope. | MemSync provides the persistence layer. Mobile access is a future story. |
| **Collaborative task sharing** | "Share tasks with team members." | Multiplayer is 10x the complexity of single-player. Auth, permissions, real-time sync. | Single-user MVP. Mention multi-user as future capability enabled by MemSync's user model. |
| **Natural language task input parsing** | "Add task: call John tomorrow at 3pm" with full NLP date/entity extraction. | Building a robust NLP date parser is a rabbit hole. Libraries exist but add complexity. | Simple manual date picker for user-created tasks. AI extraction handles dates from source content. |
| **Browser history indexing** | "Index everything I've browsed for semantic search." | Privacy concerns, massive storage, continuous background processing. Overkill for task demo. | Only index content the user explicitly asks to extract from. Opt-in, not opt-out. |
| **Offline AI inference** | "Run the AI locally for maximum privacy." | Requires bundling a local model, WebGPU/WASM complexity, large download size. | OpenGradient TEE mode IS the privacy story. No need for local inference. TEE is stronger than "trust my local device." |
| **Multiple AI model selection** | "Let me choose between GPT-4, Claude, Llama..." | Adds UI complexity, multiple API integrations, confuses the OpenGradient narrative. | Use OpenGradient's model hub exclusively. One model, verified inference. That IS the point. |
| **Detailed analytics/reporting** | "Show me productivity stats, task completion rates." | Nice-to-have that eats 1-2 days of frontend work. | Simple count of completed/pending tasks. Analytics is v2. |

## Feature Dependencies

```
[Content Script Injection]
    |
    v
[Page Content Extraction] ----requires----> [Platform-Specific Parsers]
    |                                            (Telegram, Gmail, Slack, Article)
    v
[OpenGradient LLM Inference]
    |
    +---(TEE mode)---> [Verification Attestation] ---> [Privacy Badge UI]
    |                       |
    |                       v
    |                  [On-Chain Proof Storage]
    v
[Task Object Creation]
    |
    +---> [MemSync Storage] ----enables----> [Semantic Search]
    |         |
    |         +----enables----> [Smart Categories]
    |
    +---> [chrome.storage.local] (fast cache / offline fallback)
    |
    v
[Task List UI (Popup)]
    |
    +---> [Task CRUD Operations]
    +---> [Reminder Scheduling] ---uses---> [chrome.alarms API]
    |                                           |
    |                                           v
    +---> [Search UI]                    [chrome.notifications API]
```

### Dependency Notes

- **Content Script Injection requires Manifest V3 setup:** The extension manifest, service worker, and content script infrastructure must exist before any extraction works.
- **OpenGradient LLM Inference requires SDK integration:** Python SDK needs a backend proxy or the extension must call OpenGradient's REST API directly from JavaScript. This is a critical architecture decision.
- **TEE mode requires OpenGradient inference to work first:** Get vanilla inference working, then switch to TEE mode. TEE is a flag change, not a rewrite.
- **MemSync storage requires API authentication:** Need OpenGradient/MemSync credentials and user_id management.
- **Semantic search requires MemSync storage:** Can't search what isn't stored. Get storage working first.
- **Push notifications require service worker:** MV3 already uses a service worker, so the infrastructure is shared. But alarms/notifications are independent of the task extraction pipeline.
- **Privacy badge requires attestation data:** TEE inference must return attestation; badge reads and displays it.

## MVP Definition

### Launch With (v1 -- Demo Day, 5-7 days)

Minimum set to make a compelling 5-minute demo to the OpenGradient community.

- [x] **Extension shell** (MV3 manifest, service worker, popup) -- foundation for everything
- [ ] **Content extraction from 1-2 platforms** (Telegram web + one more) -- proves the concept
- [ ] **OpenGradient LLM inference for task extraction** -- core AI feature, uses their infra
- [ ] **TEE-verified inference mode** -- THE differentiator, showcases OpenGradient privacy
- [ ] **On-chain proof display** -- show transaction hash + link to block explorer
- [ ] **MemSync persistent storage** -- tasks survive restarts, showcases MemSync
- [ ] **Semantic search over tasks** -- "find that task about..." showcases MemSync search
- [ ] **Basic task list UI** -- see tasks, mark done, delete
- [ ] **Push notification reminders** -- at least manual "remind me in X" with chrome.alarms
- [ ] **Privacy verification badge** -- visual proof that inference was TEE-verified

### Add After Validation (v1.x)

Features to add once the demo is validated and there's continued interest.

- [ ] **More platform parsers** (Gmail, Slack, articles) -- expand content extraction
- [ ] **Smart categorization via MemSync** -- auto-tag tasks by type
- [ ] **Richer notification scheduling** -- recurring reminders, snooze
- [ ] **Task editing** -- modify extracted task text, dates, notes
- [ ] **Export tasks** -- JSON/CSV export for interoperability

### Future Consideration (v2+)

Features to defer until the project has traction within the OpenGradient ecosystem.

- [ ] **Calendar integration** -- Google Calendar sync
- [ ] **Multi-user / team features** -- shared task boards
- [ ] **Browser history indexing** -- broader knowledge graph
- [ ] **Mobile companion app** -- extend beyond browser
- [ ] **Workflow automation** -- "when task is due, send Telegram message"

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Demo Impact | Priority |
|---------|------------|---------------------|-------------|----------|
| Content extraction (task detection) | HIGH | MEDIUM | HIGH | P1 |
| OpenGradient LLM inference | HIGH | MEDIUM | HIGH | P1 |
| TEE-verified inference | HIGH | LOW (flag change) | VERY HIGH | P1 |
| On-chain proof display | MEDIUM | LOW | HIGH | P1 |
| MemSync storage | HIGH | MEDIUM | HIGH | P1 |
| Task list popup UI | HIGH | LOW | MEDIUM | P1 |
| Push notifications | HIGH | MEDIUM | MEDIUM | P1 |
| Semantic search | MEDIUM | LOW (MemSync native) | HIGH | P1 |
| Privacy verification badge | MEDIUM | LOW | HIGH | P1 |
| Platform-specific parsers (2+) | MEDIUM | MEDIUM | MEDIUM | P2 |
| Smart categorization | LOW | LOW | LOW | P2 |
| Task editing | MEDIUM | LOW | LOW | P2 |
| Manual task creation | MEDIUM | LOW | LOW | P2 |
| Calendar integration | MEDIUM | HIGH | LOW | P3 |
| Analytics/reporting | LOW | MEDIUM | LOW | P3 |

**Priority key:**
- **P1:** Must have for demo day. Without these, the demo falls flat.
- **P2:** Should have if time permits. Adds polish but not essential for the story.
- **P3:** Future. Do not touch during the 5-7 day sprint.

## Competitor Feature Analysis

| Feature | Todoist | Motion | Mem.ai | Taskade | **Our Extension** |
|---------|---------|--------|--------|---------|-------------------|
| Task creation | Manual + NLP | Manual + AI scheduling | From notes | Manual + AI | **Auto-extracted from web content** |
| AI task extraction from messages | No (needs Zapier) | No | From notes only | Limited | **Core feature, multi-platform** |
| Privacy verification | None (cloud trust) | None (cloud trust) | None | None | **TEE attestation + on-chain proof** |
| Persistent memory | Cloud database | Cloud database | AI memory | Cloud database | **MemSync (decentralized, portable)** |
| Semantic search | Keyword only | Keyword only | AI-powered | AI-powered | **MemSync vector + cross-encoder** |
| Push notifications | Yes | Yes | No | Yes | **Yes (chrome.alarms)** |
| Calendar integration | Yes | Core feature | No | Yes | **Not in MVP** |
| Browser extension | Yes (basic) | No | No | Yes (basic) | **Core platform** |
| On-chain verifiability | No | No | No | No | **Unique differentiator** |
| Open source | No | No | No | No | **Likely yes (OpenGradient ethos)** |

**Key insight:** No existing task manager combines AI extraction + privacy verification + decentralized memory. This is a genuinely novel combination, not "yet another task app." The demo should lead with: "This is the first task assistant where you can PROVE your data was processed privately."

## Sources

- [Motion vs Reclaim comparison (Morgen, 2026)](https://www.morgen.so/blog-posts/motion-vs-reclaim)
- [10 Best AI Assistants in 2026 (Morgen)](https://www.morgen.so/blog-posts/best-ai-planning-assistants)
- [Todoist AI Smart Task Planning (2026)](https://www.aitools-directory.com/tools/todoist-ai-smart-task-planning/)
- [13 Best AI Task Management Software (2026)](https://thedigitalprojectmanager.com/tools/best-ai-task-management-software/)
- [AI Browser Extensions for Productivity (Analytics Insight, 2026)](https://www.analyticsinsight.net/artificial-intelligence/ai-browser-extensions-for-boosting-productivity-whats-next-in-2026)
- [ClickUp Chrome Extensions for Productivity (2026)](https://clickup.com/blog/chrome-extensions-for-productivity/)
- [Slackbot is an AI agent now (TechCrunch, Jan 2026)](https://techcrunch.com/2026/01/13/slackbot-is-an-ai-agent-now/)
- [Automating data extraction from chat messages (Parsio)](https://parsio.io/blog/how-to-automate-data-extraction-from-chat-messages-whatsapp-slack-teams-telegram/)
- [OpenGradient official docs](https://docs.opengradient.ai/)
- [OpenGradient Inference Verification docs](https://docs.opengradient.ai/learn/onchain_inference/verification)
- [OpenGradient IQ.wiki overview](https://iq.wiki/wiki/opengradient)
- [MemSync introduction docs](https://memsync.mintlify.app/)
- [Building Better AI Memory: MemSync Architecture (OpenGradient blog)](https://www.opengradient.ai/blog/building-better-ai-memory-the-architecture-behind-memsync)
- [Chrome Extensions: Use Web Push (Chrome for Developers)](https://developer.chrome.com/docs/extensions/how-to/integrate/web-push)
- [Vectoria: browser-first semantic search (GitHub)](https://github.com/arminpasalic/vectoria)
- [Taskade AI Features Mega-Guide](https://docs.taskade.com/docs/ai-powered-intelligence/ai-features)
- [Ranking AI Chrome Extensions by Privacy Risk (Incogni, 2026)](https://blog.incogni.com/chrome-extensions-privacy-2026/)
- [Decentralized AI: Verifiable Privacy-Preserving Apps (Oasis)](https://oasis.net/decentralized-ai)

---
*Feature research for: AI-powered task extraction browser extension with OpenGradient TEE verification*
*Researched: 2026-02-14*

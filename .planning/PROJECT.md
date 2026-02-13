# OpenGradient Task Assistant

## What This Is

A browser extension that automatically extracts tasks, reminders, and commitments from content you browse (Telegram, Slack, Gmail, articles) and structures them using OpenGradient's TEE-verified LLM and MemSync for persistent memory. It's an AI-powered personal assistant that remembers what you need to do so you don't have to manually track everything.

## Core Value

Automatically capture action items from any web content and remind users at the right time, with cryptographic proof of privacy through TEE.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Browser extension reads text from web pages
- [ ] OpenGradient LLM extracts action items from text with TEE verification
- [ ] MemSync stores tasks with persistent memory across sessions
- [ ] Semantic search through stored tasks
- [ ] Push notifications remind users of upcoming tasks
- [ ] Users can mark tasks as complete
- [ ] Tasks include structured data (type, action, deadline, priority, context)
- [ ] On-chain proof for LLM inference available
- [ ] Extension works on Telegram Web, Gmail, Slack, Discord
- [ ] Cross-device synchronization via MemSync

### Out of Scope

- Google Calendar integration — defer to post-MVP
- Firefox support — Chrome first, Firefox later
- Telegram bot for reminders — focus on browser notifications
- Separate web dashboard — popup UI sufficient for MVP
- Export to JSON/CSV — not needed for core value
- User-customizable prompts — use optimized default

## Context

**Target Platform:** OpenGradient ecosystem demonstration
**Primary Use Case:** Showcase OpenGradient SDK capabilities (LLM + MemSync + TEE) to gain role in OpenGradient community
**Key Innovation:** Privacy-preserving task extraction with cryptographic verification

**Technology Choices:**
- OpenGradient SDK for TEE-verified LLM inference (Claude 4.0 Sonnet)
- MemSync API for persistent memory and semantic search
- Browser Extension Manifest V3 for Chrome
- Chrome Notifications API for reminders

**Known Challenges:**
- MemSync is separate service (api.memchat.io), requires separate API key
- OpenGradient LLM may have usage limitations
- On-chain proof only for LLM inference, not for MemSync storage
- Need to handle rate limits with local caching

## Constraints

- **Timeline**: 5-7 days for MVP — need to demo quickly
- **Tech Stack**: Must use OpenGradient SDK + MemSync to showcase platform
- **Authentication**: Requires OpenGradient private key + email/password AND MemSync API key
- **Browser**: Chrome first (Firefox requires different manifest format)
- **Privacy**: All text processing must go through TEE for cryptographic guarantees

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Claude 4.0 Sonnet for extraction | Best balance of quality and speed for task extraction | — Pending |
| MemSync for storage | Persistent memory + semantic search built-in | — Pending |
| Chrome-only MVP | Faster iteration, 60%+ market share | — Pending |
| Skip Google Calendar integration | Reduces scope, browser notifications sufficient for demo | — Pending |

---
*Last updated: 2026-02-14 after initialization*

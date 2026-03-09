---
phase: 04-reminders-search
plan: 01
subsystem: ui, notifications
tags: [chrome.alarms, chrome.notifications, reminder, datetime-picker, MV3, service-worker]

# Dependency graph
requires:
  - phase: 03-task-ui-privacy-verification
    provides: "TaskCard, TaskList, App.tsx with optimistic UI patterns"
  - phase: 02-extraction-ai-storage-pipeline
    provides: "Task type, storage layer (getLocalTasks, updateTask), background message handlers"
provides:
  - "Reminder scheduling via chrome.alarms with per-task one-shot alarms"
  - "Chrome push notifications on alarm fire with task action text"
  - "Notification click opens popup and highlights the relevant task"
  - "ReminderPicker UI component with 3 states (has-reminder, bell-button, datetime-input)"
  - "syncReminders for alarm resilience across service worker restarts"
affects: [04-reminders-search]

# Tech tracking
tech-stack:
  added: [chrome.alarms, chrome.notifications, chrome.action.openPopup]
  patterns: [alarm-prefix-namespacing, sync-on-startup, highlight-via-storage-change]

key-files:
  created:
    - "entrypoints/popup/components/ReminderPicker.tsx"
  modified:
    - "lib/types.ts"
    - "lib/storage.ts"
    - "wxt.config.ts"
    - "entrypoints/background.ts"
    - "entrypoints/popup/components/TaskCard.tsx"
    - "entrypoints/popup/components/TaskList.tsx"
    - "entrypoints/popup/App.tsx"

key-decisions:
  - "ALARM_PREFIX 'reminder:' namespacing to distinguish reminder alarms from any future alarms"
  - "Optimistic UI for set/clear reminder -- instant state update, fire-and-forget to background"
  - "highlightTaskId stored in chrome.storage.local for cross-context notification-click-to-popup communication"
  - "chrome.action.openPopup() with fallback to chrome.tabs.create for notification click handling"
  - "syncReminders on both onInstalled and onStartup for full service worker lifecycle coverage"

patterns-established:
  - "Alarm prefix namespacing: ALARM_PREFIX + taskId for unique alarm/notification IDs"
  - "Storage-mediated cross-context communication: background sets highlightTaskId, popup reads and clears"
  - "Top-level event listener registration in MV3 background for chrome.alarms and chrome.notifications"

# Metrics
duration: 5min
completed: 2026-03-10
---

# Phase 4 Plan 1: Reminder System Summary

**Chrome alarm-based reminder scheduling with push notifications and click-to-highlight popup flow using datetime picker UI**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-09T21:14:43Z
- **Completed:** 2026-03-09T21:19:48Z
- **Tasks:** 2
- **Files modified:** 8 (1 created, 7 modified)

## Accomplishments
- Complete reminder pipeline: datetime picker -> chrome.alarms -> chrome.notifications -> click-to-highlight
- Reminders survive service worker termination via syncReminders on install + startup
- Backward-compatible Task type with reminderAt field and storage migration
- ReminderPicker component with 3 UI states: has-reminder (amber time + clear), bell button, datetime input

## Task Commits

Each task was committed atomically:

1. **Task 1: Type extension, manifest permissions, storage backward compat, and background alarm/notification handlers** - `009ee10` (feat)
2. **Task 2: ReminderPicker component, TaskCard integration, and App.tsx wiring** - `09fea99` (feat)

## Files Created/Modified
- `lib/types.ts` - Added reminderAt: string | null to Task interface
- `lib/storage.ts` - Added reminderAt backward compat default in getLocalTasks
- `wxt.config.ts` - Added alarms + notifications permissions, bumped to v0.4.0
- `entrypoints/background.ts` - Added chrome.alarms.onAlarm, chrome.notifications.onClicked, SET_REMINDER/CLEAR_REMINDER handlers, syncReminders, reminderAt in enriched tasks
- `entrypoints/popup/components/ReminderPicker.tsx` - NEW: 3-state reminder picker (has-reminder, bell-button, datetime-input)
- `entrypoints/popup/components/TaskCard.tsx` - Integrated ReminderPicker, added data-task-id attribute
- `entrypoints/popup/components/TaskList.tsx` - Pass-through onSetReminder/onClearReminder props
- `entrypoints/popup/App.tsx` - handleSetReminder/handleClearReminder with optimistic UI, highlightTaskId listener, v0.4.0

## Decisions Made
- ALARM_PREFIX "reminder:" namespacing to isolate reminder alarms from any future alarm usage
- Optimistic UI for both set and clear reminder -- instant UI update, fire-and-forget messaging to background
- highlightTaskId in chrome.storage.local for notification-click-to-popup cross-context communication
- chrome.action.openPopup() with fallback to chrome.tabs.create for broad Chrome version support
- syncReminders on both onInstalled and onStartup to cover all service worker lifecycle scenarios

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type error for highlightTaskId**
- **Found during:** Task 2 (App.tsx wiring)
- **Issue:** chrome.storage.local.get returns untyped values; highlightTaskId inferred as `{}` causing TS2345 error when passed to highlightTask(string)
- **Fix:** Added `as string` cast for highlightTaskId in both the mount effect and storage change listener
- **Files modified:** entrypoints/popup/App.tsx
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** 09fea99 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Trivial type cast needed for Chrome storage API return types. No scope change.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Reminder system fully operational, ready for Phase 4 Plan 2 (search/filter)
- All NOTIF-01 through NOTIF-05 requirements delivered
- Version bumped to 0.4.0

## Self-Check: PASSED

All 9 files verified present. Both commit hashes (009ee10, 09fea99) confirmed in git log.

---
*Phase: 04-reminders-search*
*Completed: 2026-03-10*

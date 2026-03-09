# Phase 4: Reminders + Search - Research

**Researched:** 2026-03-09
**Domain:** Chrome Extension APIs (alarms, notifications), client-side search
**Confidence:** HIGH

## Summary

Phase 4 delivers two independent features: (1) a reminder system using `chrome.alarms` and `chrome.notifications`, and (2) a client-side search over locally stored tasks. The original requirements reference MemSync for semantic search, but **MemSync has been removed from the project entirely** (user decision in Phase 2). Search must be reimplemented as client-side fuzzy/text search over `chrome.storage.local` tasks.

The reminder system is straightforward: `chrome.alarms` schedules one-shot timers per task, `chrome.notifications` displays the reminder, and `chrome.notifications.onClicked` navigates the user to the task. The main complexity is the Task type extension (adding `reminderAt` field), the datetime picker UI in the compact popup, and alarm lifecycle management across service worker restarts.

For search, **Fuse.js** is the standard lightweight fuzzy search library (~5KB gzipped). It runs entirely client-side against the task array, supports weighted multi-field search (action, context, type, priority), and needs zero external dependencies. This replaces the original MemSync semantic search requirement with a practical, offline-capable alternative.

**Primary recommendation:** Use `chrome.alarms` + `chrome.notifications` for reminders, Fuse.js for client-side fuzzy search, and native `<input type="datetime-local">` for the reminder time picker (zero dependencies, Chrome renders it natively).

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| WXT | ^0.20.17 | Extension framework, manifest generation | Already installed |
| React | ^19.2.4 | UI components | Already installed |
| Tailwind CSS | ^4.1.18 | Styling | Already installed |
| @types/chrome | ^0.1.36 | Chrome API types | Already installed |

### New for Phase 4
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Fuse.js | ^7.1.0 | Client-side fuzzy search | 5.5M weekly downloads, ~5KB gzipped, zero deps, industry standard for client-side search |

### Not Needed (Use Native APIs Instead)
| Problem | Don't Install | Use Instead | Why |
|---------|---------------|-------------|-----|
| DateTime picker | react-datepicker, react-tailwindcss-datetimepicker | `<input type="datetime-local">` | Native Chrome rendering, zero bundle cost, works perfectly in extension popups |
| Scheduling | node-cron, setTimeout | `chrome.alarms` | Survives service worker termination, Chrome-native |
| Notifications | web-push, firebase | `chrome.notifications` | Chrome-native, no server needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Fuse.js | MiniSearch | MiniSearch has inverted index (faster for large sets), but Fuse.js has 10x more downloads, better fuzzy matching for small sets (<500 tasks), simpler API |
| Fuse.js | Native String.includes() | No fuzzy matching, no ranking, no multi-field search. Fuse.js adds ~5KB for much better UX |
| Fuse.js | FlexSearch | Better performance at scale, but overkill for <500 tasks in chrome.storage.local |

**Installation:**
```bash
pnpm add fuse.js
```

## Architecture Patterns

### Reminder Data Flow
```
User sets reminder (popup)
  -> Task updated with reminderAt field (storage)
  -> chrome.alarms.create with alarm name "reminder:{taskId}" (background)
  -> Service worker wakes on alarm fire
  -> chrome.notifications.create shows notification
  -> User clicks notification
  -> chrome.action.openPopup() opens popup (Chrome 127+)
```

### Search Data Flow
```
User types in search box (popup)
  -> Debounced input (300ms)
  -> Fuse.js searches across tasks array in memory
  -> Results sorted by relevance score
  -> TaskList renders filtered results
```

### Recommended Component Structure
```
entrypoints/
  popup/
    components/
      TaskCard.tsx        # MODIFIED: add reminder bell icon + indicator
      TaskList.tsx        # MODIFIED: add search input above list
      SearchBar.tsx       # NEW: search input with Fuse.js integration
      ReminderPicker.tsx  # NEW: datetime-local input for setting reminders
  background.ts           # MODIFIED: add alarm handlers, notification handlers
lib/
  types.ts                # MODIFIED: add reminderAt to Task type
  storage.ts              # EXISTING: updateTask already supports partial updates
  search.ts               # NEW: Fuse.js configuration and search function
```

### Pattern 1: Alarm Naming Convention
**What:** Use structured alarm names that encode the task ID for easy lookup when the alarm fires.
**When to use:** Always, for all reminder alarms.
**Example:**
```typescript
// Alarm name encodes the task ID for retrieval on fire
const ALARM_PREFIX = 'reminder:';

function createReminderAlarm(taskId: string, reminderAt: string): void {
  const alarmName = `${ALARM_PREFIX}${taskId}`;
  const when = new Date(reminderAt).getTime();
  chrome.alarms.create(alarmName, { when });
}

// In onAlarm listener, extract task ID from alarm name
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const taskId = alarm.name.slice(ALARM_PREFIX.length);
  // Look up task, show notification
});
```

### Pattern 2: Notification Click -> Open Popup
**What:** When user clicks a notification, open the extension popup and highlight the relevant task.
**When to use:** NOTIF-05 requirement.
**Example:**
```typescript
// Register at TOP LEVEL of service worker (critical for MV3)
chrome.notifications.onClicked.addListener(async (notificationId) => {
  // notificationId matches alarm name: "reminder:{taskId}"
  const taskId = notificationId.replace(ALARM_PREFIX, '');

  // Store the target task ID so popup can scroll to it
  await chrome.storage.local.set({ highlightTaskId: taskId });

  // Open the popup (Chrome 127+, no user gesture required)
  await chrome.action.openPopup();

  // Clear the notification
  chrome.notifications.clear(notificationId);
});
```

### Pattern 3: Fuse.js Search Configuration
**What:** Configure Fuse.js for multi-field weighted search across task properties.
**When to use:** SRCH-01 through SRCH-04.
**Example:**
```typescript
// Source: Fuse.js official docs (fusejs.io)
import Fuse from 'fuse.js';
import type { Task } from './types';

const fuseOptions: Fuse.IFuseOptions<Task> = {
  keys: [
    { name: 'action', weight: 2 },    // Primary: task action text
    { name: 'context', weight: 1.5 },  // Secondary: context/details
    { name: 'type', weight: 0.5 },     // Tertiary: task type
    { name: 'priority', weight: 0.3 }, // Low: priority level
  ],
  threshold: 0.4,        // 0=exact, 1=match anything. 0.4 is good default
  includeScore: true,     // Include relevance score in results
  minMatchCharLength: 2,  // Minimum characters to match
};

export function searchTasks(tasks: Task[], query: string): Task[] {
  if (!query.trim()) return tasks;
  const fuse = new Fuse(tasks, fuseOptions);
  return fuse.search(query).map(result => result.item);
}
```

### Pattern 4: Debounced Search Input
**What:** Prevent excessive re-renders by debouncing search input.
**When to use:** SearchBar component.
**Example:**
```typescript
function SearchBar({ onSearch }: { onSearch: (query: string) => void }) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => onSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, onSearch]);

  return (
    <input
      type="text"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Search tasks..."
      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
    />
  );
}
```

### Anti-Patterns to Avoid
- **Using setTimeout/setInterval in service workers:** Service workers terminate after ~30s of inactivity. Use `chrome.alarms` instead -- they survive worker termination.
- **Creating Fuse instance on every keystroke:** Create the Fuse instance once when tasks change, not on every search query. Use `useMemo`.
- **Not registering listeners at top level:** `chrome.alarms.onAlarm` and `chrome.notifications.onClicked` MUST be registered at the top level of background.ts, not inside async functions or conditionals.
- **Alarm names without prefix:** Raw task IDs as alarm names risk collision with future alarms. Always prefix with `reminder:`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fuzzy text search | Custom string matching, regex patterns | Fuse.js | Handles typos, partial matches, scoring, weighting. Hand-rolled fuzzy search is a well-known rabbit hole |
| Scheduled execution | setTimeout, setInterval | chrome.alarms | Service worker terminates; only chrome.alarms survives. Zero choice here |
| System notifications | DOM alerts, custom toast UI | chrome.notifications | Appears in system tray, survives popup close, has click handlers. Cannot be replicated in extension popup |
| DateTime input | Custom calendar component | Native `<input type="datetime-local">` | Chrome renders it perfectly, zero JS needed, handles timezone, validation built-in |
| Debounce | Custom timer logic | Inline setTimeout pattern (4 lines) | Too small for a library. Simple useEffect + setTimeout pattern is sufficient |

**Key insight:** This phase has very few "build" decisions. chrome.alarms and chrome.notifications are the ONLY options for scheduling and system notifications in MV3 extensions. The only real choice is the search library (Fuse.js) and the datetime picker approach (native input).

## Common Pitfalls

### Pitfall 1: Service Worker Termination Kills Timers
**What goes wrong:** Using `setTimeout` or `setInterval` for reminders. The service worker terminates after ~30s of inactivity, killing all JS timers.
**Why it happens:** Developers coming from MV2 background pages (which were persistent) or web apps.
**How to avoid:** Use `chrome.alarms` exclusively. It is the ONLY mechanism that survives service worker termination in MV3.
**Warning signs:** Reminders work during development (service worker stays active due to DevTools) but fail in production.

### Pitfall 2: Event Listeners Not at Top Level
**What goes wrong:** `chrome.alarms.onAlarm` or `chrome.notifications.onClicked` listeners placed inside `defineBackground(() => { ... })` callback but wrapped in async functions, conditionals, or registered after await.
**Why it happens:** Developers try to check conditions before registering.
**How to avoid:** Register ALL event listeners synchronously at the top level of the service worker callback. Chrome must find them immediately when the worker starts.
**Warning signs:** Alarms fire but notification doesn't appear; notification clicks do nothing.

### Pitfall 3: Alarms Not Persisted Across Browser Restart
**What goes wrong:** Alarms may be cleared when the browser restarts. User sets a reminder, closes browser, reopens -- alarm is gone.
**Why it happens:** Chrome documentation states alarms "generally persist until extension is updated" but this is NOT guaranteed across browser restarts.
**How to avoid:** Store `reminderAt` in the Task object in `chrome.storage.local`. On service worker startup (`runtime.onInstalled` + `runtime.onStartup`), iterate tasks with `reminderAt` in the future and recreate any missing alarms.
**Warning signs:** Reminders work during a session but disappear after browser restart.

### Pitfall 4: chrome.action.openPopup Not Available
**What goes wrong:** Calling `chrome.action.openPopup()` on older Chrome versions (pre-127) throws an error or is undefined.
**Why it happens:** This API was only available to policy-installed extensions before Chrome 127 (July 2024).
**How to avoid:** Check `typeof chrome.action.openPopup === 'function'` before calling. Fallback: use `chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') })` to open the popup as a tab.
**Warning signs:** Works on developer's Chrome (latest) but fails on user's Chrome (older version).

### Pitfall 5: Notification Icons Missing
**What goes wrong:** `chrome.notifications.create` requires an `iconUrl`. If omitted or pointing to an invalid path, notification creation fails silently.
**Why it happens:** Extension icon paths are different from web paths. Must use `chrome.runtime.getURL()` or a direct relative path from the extension root.
**How to avoid:** Use the extension's existing icon: `iconUrl: chrome.runtime.getURL('/icon/128.png')` (or whatever icon path exists).
**Warning signs:** `chrome.notifications.create` callback gets `undefined` notificationId.

### Pitfall 6: Fuse.js Re-instantiation on Every Search
**What goes wrong:** Creating a new `Fuse` instance on every keystroke. Fuse builds an internal index on construction -- doing this per keystroke wastes CPU.
**Why it happens:** Treating Fuse like a pure function.
**How to avoid:** Create Fuse instance with `useMemo` keyed on the tasks array. Only rebuild when tasks change.
**Warning signs:** Search feels sluggish despite small dataset.

### Pitfall 7: Manifest Permissions Missing
**What goes wrong:** Forgetting to add `"alarms"` and `"notifications"` to the manifest permissions array. API calls fail silently or throw.
**Why it happens:** WXT auto-generates the manifest; developers assume permissions are auto-detected (they're not for alarms/notifications).
**How to avoid:** Explicitly add to `wxt.config.ts`: `permissions: ['storage', 'activeTab', 'clipboardRead', 'alarms', 'notifications']`.
**Warning signs:** `chrome.alarms` or `chrome.notifications` is undefined in background.ts.

## Code Examples

### Complete Alarm + Notification Flow (background.ts additions)
```typescript
// Source: Chrome Extensions API docs
// MUST be at top level of defineBackground callback

const ALARM_PREFIX = 'reminder:';

// 1. Handle alarm firing -> show notification
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const taskId = alarm.name.slice(ALARM_PREFIX.length);

  const { tasks = [] } = await chrome.storage.local.get('tasks');
  const task = tasks.find((t: Task) => t.id === taskId);
  if (!task) return;

  chrome.notifications.create(alarm.name, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('/icon/128.png'),
    title: 'Task Reminder',
    message: task.action,
    priority: 2,
  });
});

// 2. Handle notification click -> open popup
chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (!notificationId.startsWith(ALARM_PREFIX)) return;
  const taskId = notificationId.slice(ALARM_PREFIX.length);

  await chrome.storage.local.set({ highlightTaskId: taskId });

  if (typeof chrome.action?.openPopup === 'function') {
    try {
      await chrome.action.openPopup();
    } catch {
      // Fallback: open popup as tab
      chrome.tabs.create({ url: chrome.runtime.getURL('/popup.html') });
    }
  } else {
    chrome.tabs.create({ url: chrome.runtime.getURL('/popup.html') });
  }

  chrome.notifications.clear(notificationId);
});

// 3. Message handler for SET_REMINDER
if (message.type === 'SET_REMINDER') {
  (async () => {
    try {
      const { taskId, reminderAt } = message;
      await updateTask(taskId, { reminderAt });

      const when = new Date(reminderAt).getTime();
      if (when > Date.now()) {
        await chrome.alarms.create(`${ALARM_PREFIX}${taskId}`, { when });
      }
      sendResponse({ success: true });
    } catch (err) {
      sendResponse({ success: false, error: String(err) });
    }
  })();
  return true;
}

// 4. Message handler for CLEAR_REMINDER
if (message.type === 'CLEAR_REMINDER') {
  (async () => {
    try {
      await updateTask(message.taskId, { reminderAt: null });
      await chrome.alarms.clear(`${ALARM_PREFIX}${message.taskId}`);
      sendResponse({ success: true });
    } catch (err) {
      sendResponse({ success: false, error: String(err) });
    }
  })();
  return true;
}
```

### Alarm Recovery on Service Worker Startup
```typescript
// Source: Chrome Extensions lifecycle docs
// Called on install, update, AND browser restart

async function syncReminders() {
  const { tasks = [] } = await chrome.storage.local.get('tasks');
  const existingAlarms = await chrome.alarms.getAll();
  const existingNames = new Set(existingAlarms.map(a => a.name));

  for (const task of tasks) {
    if (!task.reminderAt) continue;
    const alarmName = `${ALARM_PREFIX}${task.id}`;
    const when = new Date(task.reminderAt).getTime();

    if (when > Date.now() && !existingNames.has(alarmName)) {
      await chrome.alarms.create(alarmName, { when });
    } else if (when <= Date.now() && task.reminderAt) {
      // Reminder time passed -- clear the reminderAt field
      await updateTask(task.id, { reminderAt: null });
    }
  }
}

browser.runtime.onInstalled.addListener(() => syncReminders());
browser.runtime.onStartup.addListener(() => syncReminders());
```

### Task Type Extension
```typescript
// Add to lib/types.ts
export interface Task {
  id: string;
  type: 'call' | 'meeting' | 'task' | 'note' | 'reminder';
  action: string;
  deadline: string | null;
  priority: 'low' | 'medium' | 'high';
  context: string;
  sourceUrl: string;
  platform: 'clipboard' | 'telegram' | 'selection' | 'other';
  createdAt: string;
  txHash: string | null;
  completed: boolean;
  completedAt: string | null;
  reminderAt: string | null;  // NEW: ISO 8601 reminder time, or null
}
```

### ReminderPicker Component
```typescript
// Native datetime-local input -- zero dependencies
interface ReminderPickerProps {
  task: Task;
  onSetReminder: (taskId: string, reminderAt: string) => void;
  onClearReminder: (taskId: string) => void;
}

function ReminderPicker({ task, onSetReminder, onClearReminder }: ReminderPickerProps) {
  const [showPicker, setShowPicker] = useState(false);

  if (task.reminderAt) {
    return (
      <div className="flex items-center gap-1 text-[11px]">
        <span className="text-amber-600">
          {new Date(task.reminderAt).toLocaleString()}
        </span>
        <button onClick={() => onClearReminder(task.id)} className="text-gray-400 hover:text-red-500">
          x
        </button>
      </div>
    );
  }

  if (!showPicker) {
    return (
      <button onClick={() => setShowPicker(true)} className="text-[11px] text-gray-400 hover:text-indigo-500">
        Set reminder
      </button>
    );
  }

  return (
    <input
      type="datetime-local"
      min={new Date().toISOString().slice(0, 16)}
      className="text-[11px] border border-gray-200 rounded px-1 py-0.5"
      onChange={(e) => {
        if (e.target.value) {
          onSetReminder(task.id, new Date(e.target.value).toISOString());
          setShowPicker(false);
        }
      }}
      onBlur={() => setShowPicker(false)}
      autoFocus
    />
  );
}
```

### Manifest Permissions Update (wxt.config.ts)
```typescript
// Source: WXT docs, Chrome Extensions permissions docs
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'OpenGradient Task Assistant',
    description: 'AI-powered task extraction with TEE-verified privacy',
    version: '0.4.0',
    permissions: ['storage', 'activeTab', 'clipboardRead', 'alarms', 'notifications'],
    host_permissions: [
      'http://localhost:8402/*',
      'https://sepolia.base.org/*',
      'https://web.telegram.org/*',
    ],
  },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| chrome.alarms min 60s interval | Min 30s interval (Chrome 120+) | Chrome 120 (Dec 2023) | Not relevant for one-shot reminders, but good to know |
| chrome.action.openPopup policy-only | Available to ALL extensions | Chrome 127 (July 2024) | Can open popup from notification click without needing policy installation |
| MemSync semantic search (original plan) | Client-side Fuse.js fuzzy search | User decision (Phase 2) | No external API dependency, works offline, simpler architecture |
| Fuse.js 6.x | Fuse.js 7.x | 2024 | ESM-first, better TypeScript support, same API surface |

**Deprecated/outdated:**
- MemSync API: Removed from project entirely per user decision. All search is local.
- chrome.webRequest-based background pages: Replaced by service workers in MV3.

## SRCH-02 Adaptation

The original requirement **SRCH-02** states "Semantic search queries MemSync API." Since MemSync has been removed, this requirement must be adapted:

**Original:** SRCH-02: Semantic search queries MemSync API
**Adapted:** SRCH-02: Fuzzy search queries local task storage via Fuse.js

The adaptation maintains the spirit of the requirement (search capability) while using the actual storage backend (chrome.storage.local). Fuse.js fuzzy matching provides a reasonable approximation of "natural language" search for a small local dataset:
- Handles typos and partial matches (fuzzy matching)
- Searches across multiple fields with weighting (action, context, type)
- Returns results ranked by relevance score
- No external API dependency

**SRCH-04** ("search by content, person, or topic") is addressed by Fuse.js multi-key search across `action` (content), `context` (person references, topic details), and `type` (task category).

## Open Questions

1. **Extension icon path for notifications**
   - What we know: `chrome.notifications.create` requires `iconUrl`. The extension has icons.
   - What's unclear: Exact icon file path(s) in the WXT build output. WXT may rename/relocate icons.
   - Recommendation: Check WXT build output for icon paths. Likely `chrome.runtime.getURL('/icon/128.png')` or similar. Verify during implementation.

2. **Popup highlight on notification click**
   - What we know: We can store `highlightTaskId` in `chrome.storage.local` before opening popup. Popup reads it on mount and scrolls to that task.
   - What's unclear: Whether `chrome.action.openPopup()` opens a fresh popup instance or reuses existing one. If reused, the popup's useEffect may not re-fire.
   - Recommendation: Use `chrome.storage.onChanged` listener in the popup to react to `highlightTaskId` changes in real-time, rather than only reading on mount.

3. **Past-due reminder cleanup**
   - What we know: If browser was closed when a reminder was due, the alarm fires once on next startup. But the `reminderAt` field remains set on the task.
   - What's unclear: Whether to show notification for past-due reminders or silently clear them.
   - Recommendation: Show the notification for any reminder due in the last 24 hours. Silently clear `reminderAt` for anything older.

## Sources

### Primary (HIGH confidence)
- [Chrome Alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms) - Full API reference, minimum intervals, persistence behavior
- [Chrome Notifications API](https://developer.chrome.com/docs/extensions/reference/api/notifications) - Notification types, events, MV3 support
- [Chrome Action API](https://developer.chrome.com/docs/extensions/reference/api/action) - openPopup availability (Chrome 127+)
- [Chrome Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) - Event registration requirements
- [WXT Manifest Config](https://wxt.dev/guide/essentials/config/manifest) - Permission declaration in wxt.config.ts
- [Fuse.js Official Docs](https://www.fusejs.io/) - API, options, examples

### Secondary (MEDIUM confidence)
- [Fuse.js vs MiniSearch npm comparison](https://npm-compare.com/elasticlunr,flexsearch,fuse.js,minisearch) - Download stats, feature comparison
- [Oliver Dunk - action.openPopup](https://oliverdunk.com/2022/11/13/extensions-open-popup) - History of openPopup API availability
- [Chrome Whats New](https://developer.chrome.com/docs/extensions/whats-new) - Chrome 120 alarm improvements, Chrome 127 openPopup

### Tertiary (LOW confidence)
- Bundle size for Fuse.js 7.1.0: ~5KB gzipped (from bundlephobia, could not directly verify current version)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - chrome.alarms and chrome.notifications are the only viable options in MV3; Fuse.js is the clear standard for client-side fuzzy search
- Architecture: HIGH - patterns are well-documented in Chrome Extensions official docs, alarm naming convention is standard practice
- Pitfalls: HIGH - service worker termination, top-level listener registration, and alarm persistence are extensively documented gotchas in the Chrome Extensions community
- Search adaptation: MEDIUM - Fuse.js fuzzy search is a good approximation of "natural language search" for a small local dataset, but it is NOT true semantic search. It handles typos and partial matches, not semantic understanding

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable Chrome APIs, unlikely to change)

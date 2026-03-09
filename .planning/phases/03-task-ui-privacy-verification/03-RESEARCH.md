# Phase 3: Task UI + Privacy Verification - Research

**Researched:** 2026-03-09
**Domain:** Chrome extension popup UI (React 19 + Tailwind CSS 4), task CRUD operations on chrome.storage.local, x402 TEE attestation display
**Confidence:** HIGH

## Summary

Phase 3 builds on a working extraction pipeline (Phase 2) to deliver a full task management UI and privacy verification display. The existing codebase already has a basic task list rendering in `App.tsx` with inline styles. The work involves: (1) upgrading the task list to support complete/delete operations with visual state changes, (2) extending `storage.ts` with update/delete functions, (3) adding background message handlers for CRUD, and (4) displaying TEE verification badges and on-chain proof links.

The project already uses Tailwind CSS 4 (configured via `@tailwindcss/vite` plugin, imported as `@import "tailwindcss"` in `style.css`) but the current popup uses **inline styles exclusively**. Phase 3 should migrate to Tailwind utility classes for maintainability. The Task type already includes `txHash` and the popup already renders a minimal "tx" link to `explorer.opengradient.ai`. This phase enriches that into a proper verification badge with attestation status.

**Primary recommendation:** Extend the existing `Task` type with a `completed` boolean field, add `updateTask`/`deleteTask` to `storage.ts`, wire new background message handlers (`COMPLETE_TASK`, `DELETE_TASK`), and rebuild the popup task list using Tailwind CSS classes with checkbox-based completion and delete buttons. For privacy verification, enhance the existing `txHash` link into a badge component showing TEE attestation status (verified/pending/none).

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^19.2.4 | Popup UI framework | Already in project |
| react-dom | ^19.2.4 | DOM rendering | Already in project |
| Tailwind CSS | ^4.1.18 | Utility-first CSS | Already configured via @tailwindcss/vite |
| WXT | ^0.20.17 | Extension framework | Already in project, provides `browser` API |

### Supporting (Already Installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/chrome | ^0.1.36 | Chrome API types | Storage, runtime messaging |
| TypeScript | ^5.9.3 | Type safety | All source files |

### No New Dependencies Required

This phase requires **zero new npm packages**. Everything needed (React state, Tailwind CSS, chrome.storage, browser.runtime messaging) is already available. The UI is simple enough that no component library is warranted for a 380px-wide extension popup.

## Architecture Patterns

### Current Code Structure
```
entrypoints/
  popup/
    App.tsx          # Main popup component (monolithic, ~484 lines)
    main.tsx         # React root mount
    style.css        # @import "tailwindcss"
  background.ts      # Service worker message handlers
lib/
  types.ts           # Task interface, generateTaskId
  storage.ts         # saveTasksLocally, getLocalTasks
  task-extractor.ts  # LLM prompt, response parser
  opengradient.ts    # x402 client, LLM inference calls
```

### Recommended Refactoring for Phase 3
```
entrypoints/
  popup/
    App.tsx           # Top-level layout + extraction controls (slimmed down)
    components/
      TaskList.tsx     # Scrollable task list container
      TaskCard.tsx     # Individual task with checkbox, delete, badge
      VerifyBadge.tsx  # TEE verification badge component
      KeySetup.tsx     # Wallet key input (extracted from App.tsx)
    style.css          # @import "tailwindcss" (unchanged)
  background.ts        # Extended with COMPLETE_TASK, DELETE_TASK handlers
lib/
  types.ts             # Task interface extended with `completed` field
  storage.ts           # Extended with updateTask, deleteTask
  ...                  # Other files unchanged
```

### Pattern 1: Task Type Extension
**What:** Add `completed` and `completedAt` fields to the existing `Task` interface
**When to use:** All CRUD operations need to distinguish completed from pending tasks

```typescript
// Extend existing Task interface in lib/types.ts
export interface Task {
  // ... existing fields ...
  completed: boolean;           // NEW: whether task is marked done
  completedAt: string | null;   // NEW: ISO 8601 timestamp when completed
}
```

**Migration note:** Existing stored tasks won't have these fields. The storage layer must handle backward compatibility by defaulting `completed: false` and `completedAt: null` when reading old tasks.

### Pattern 2: Storage CRUD via Background Messages
**What:** All storage mutations go through the background service worker via `browser.runtime.sendMessage`
**When to use:** The popup cannot directly call `chrome.storage.local` in a way that stays consistent across popup open/close cycles. The background is the single source of truth.
**Why this pattern:** The current codebase already uses this pattern (GET_TASKS, EXTRACT_FROM_CLIPBOARD). Extending it is natural and consistent.

Message types needed:
```typescript
// New message types for Phase 3
{ type: "COMPLETE_TASK", taskId: string }     // Toggle completion
{ type: "DELETE_TASK", taskId: string }        // Remove task
{ type: "GET_TASKS" }                          // Already exists
```

### Pattern 3: Optimistic UI Updates
**What:** Update local React state immediately, then send message to background for persistence
**When to use:** Complete/delete operations should feel instant
**Example:**
```typescript
const handleComplete = (taskId: string) => {
  // 1. Optimistic: update local state immediately
  setTasks(prev => prev.map(t =>
    t.id === taskId
      ? { ...t, completed: !t.completed, completedAt: t.completed ? null : new Date().toISOString() }
      : t
  ));
  // 2. Persist: send to background (fire-and-forget OK for toggles)
  browser.runtime.sendMessage({ type: "COMPLETE_TASK", taskId });
};
```

### Pattern 4: Tailwind Migration from Inline Styles
**What:** Replace all inline `style={{...}}` in App.tsx with Tailwind utility classes
**When to use:** During this phase's UI rebuild
**Why:** The current popup has ~100 lines of inline style objects. Tailwind classes are more maintainable and enable responsive/state-based styling (e.g., `line-through` for completed tasks via conditional classes).

```tsx
// BEFORE (current):
<div style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}>

// AFTER (Tailwind):
<div className="px-2.5 py-2 border-b border-gray-100 text-sm">
```

### Anti-Patterns to Avoid
- **Direct storage calls from popup:** Always go through background message handlers. Direct `chrome.storage.local.set()` from popup can cause race conditions if background is also writing.
- **Storing UI state in chrome.storage:** Only persist domain data (tasks). Transient UI state (loading spinners, selected filters) stays in React state.
- **Re-rendering full list on single task change:** Use task ID as React key and update only the changed task in state.
- **Popup-only state for tasks:** If user closes and reopens popup, state must be reloaded from storage. Always persist first.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Popup styling system | Custom CSS framework | Tailwind CSS 4 (already installed) | Already configured, v4 is zero-config with @import |
| Storage read-modify-write | Manual get/set with conflict resolution | Simple helper functions in storage.ts | Scale is tiny (hundreds of tasks max), no concurrent writers |
| Component library | Custom design system | Raw Tailwind utility classes | Popup is 380px wide, 5-6 components max. Overhead of a UI library is not warranted |
| Task ID generation | UUID library | Existing `generateTaskId()` in types.ts | Already works, deterministic dedup |
| State management | Redux/Zustand/Context | `useState` + message passing | Only 1 component tree, single data type (tasks), overkill to add a state library |

**Key insight:** This is a tiny UI surface (380x600px max). The entire feature set is: list items with checkboxes, delete buttons, and badge icons. No routing, no forms, no complex state. Keep it simple.

## Common Pitfalls

### Pitfall 1: chrome.storage.local Requires Read-Modify-Write for Arrays
**What goes wrong:** Calling `chrome.storage.local.set({ tasks: [newTask] })` overwrites the entire tasks array instead of appending.
**Why it happens:** chrome.storage has no array push/splice operations. Every mutation requires get -> modify -> set.
**How to avoid:** The existing `saveTasksLocally()` already handles this correctly. New `updateTask()` and `deleteTask()` functions must follow the same pattern: read all tasks, find/modify/remove the target, write back.
**Warning signs:** Tasks disappearing after operations, or operations not persisting across popup close/reopen.

### Pitfall 2: Popup Losing State on Close/Reopen
**What goes wrong:** User completes a task, closes popup, reopens -- task shows as incomplete.
**Why it happens:** React state in popup is ephemeral. If the background message to persist completes after popup closes, the state is lost in React but saved in storage. Or vice versa.
**How to avoid:** Always persist to storage FIRST (or simultaneously), and reload from storage on mount. The current `useEffect` on mount already calls `GET_TASKS` -- this pattern is correct.
**Warning signs:** State drift between what's shown and what's stored.

### Pitfall 3: Backward Compatibility of Task Type
**What goes wrong:** Adding `completed` field to Task interface breaks reading of existing stored tasks that lack this field.
**Why it happens:** Tasks saved in Phase 2 don't have `completed` or `completedAt` fields.
**How to avoid:** In `getLocalTasks()` (or a new migration function), default missing fields: `completed: task.completed ?? false`, `completedAt: task.completedAt ?? null`. Also clean up the now-irrelevant `memsyncId` and `synced` fields.
**Warning signs:** TypeScript compile errors or runtime undefined access on old tasks.

### Pitfall 4: Chrome Extension Popup Max Dimensions
**What goes wrong:** Task list overflows or popup becomes unusably large.
**Why it happens:** Chrome enforces max popup size of ~800x600px. The current popup is 380px wide.
**How to avoid:** Keep the popup width at 380px. Use `max-h-[400px] overflow-y-auto` on the task list container. Tasks should be compact (2-3 lines each).
**Warning signs:** Popup clipping content, scrollbar not appearing, layout breaking with many tasks.

### Pitfall 5: txHash Can Be Null (Batch Settlement)
**What goes wrong:** Attempting to render explorer link when `txHash` is null, or showing "verified" badge when no hash exists.
**Why it happens:** With batch settlement, the `x-payment-response` header may contain a transaction hash, but it represents a payment settlement, not necessarily a TEE attestation reference. Also, the header might not always be present.
**How to avoid:** Design three badge states: (1) "Verified" when txHash exists -- this is the on-chain payment proof, (2) "TEE" always shown since all inference runs in TEE by design, (3) "No proof" when txHash is null. The TEE badge is informational (OpenGradient runs all inference in TEE), while the txHash proves the payment was settled on-chain.
**Warning signs:** Empty/broken links, misleading verification status.

### Pitfall 6: Legacy Fields in Task Type (memsyncId, synced)
**What goes wrong:** Displaying meaningless "synced: false" or "memsyncId: null" data for every task.
**Why it happens:** MemSync was removed in Phase 2 (02-03), but the fields remain in the Task interface.
**How to avoid:** Remove `memsyncId` and `synced` from the Task interface during this phase. They serve no purpose. Update `background.ts` task enrichment to stop setting these fields. Old stored tasks with these fields are harmless (extra properties are ignored).

## Code Examples

### Storage Layer: updateTask and deleteTask

```typescript
// lib/storage.ts -- add these functions

/**
 * Update a single task in chrome.storage.local.
 * Finds by task.id and replaces the entire task object.
 */
export async function updateTask(taskId: string, updates: Partial<Task>): Promise<void> {
  const { tasks = [] } = await chrome.storage.local.get('tasks') as { tasks?: Task[] };
  const updated = tasks.map(t =>
    t.id === taskId ? { ...t, ...updates } : t
  );
  await chrome.storage.local.set({ tasks: updated });
}

/**
 * Delete a task from chrome.storage.local by ID.
 */
export async function deleteTask(taskId: string): Promise<void> {
  const { tasks = [] } = await chrome.storage.local.get('tasks') as { tasks?: Task[] };
  const filtered = tasks.filter(t => t.id !== taskId);
  await chrome.storage.local.set({ tasks: filtered });
}
```

### Background Message Handlers

```typescript
// In background.ts -- add these handlers

if (message.type === "COMPLETE_TASK") {
  (async () => {
    try {
      const { tasks = [] } = await chrome.storage.local.get('tasks') as { tasks?: Task[] };
      const task = tasks.find(t => t.id === message.taskId);
      if (!task) {
        sendResponse({ success: false, error: "Task not found" });
        return;
      }
      const newCompleted = !task.completed;
      await updateTask(message.taskId, {
        completed: newCompleted,
        completedAt: newCompleted ? new Date().toISOString() : null,
      });
      sendResponse({ success: true });
    } catch (err) {
      sendResponse({ success: false, error: String(err) });
    }
  })();
  return true;
}

if (message.type === "DELETE_TASK") {
  deleteTask(message.taskId)
    .then(() => sendResponse({ success: true }))
    .catch(err => sendResponse({ success: false, error: String(err) }));
  return true;
}
```

### TaskCard Component (Tailwind)

```tsx
// entrypoints/popup/components/TaskCard.tsx

interface TaskCardProps {
  task: Task;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
}

function TaskCard({ task, onComplete, onDelete }: TaskCardProps) {
  return (
    <div className={`px-3 py-2 border-b border-gray-100 ${task.completed ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2">
        {/* Checkbox */}
        <button
          onClick={() => onComplete(task.id)}
          className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center
            ${task.completed
              ? 'bg-indigo-500 border-indigo-500 text-white'
              : 'border-gray-300 hover:border-indigo-400'
            }`}
        >
          {task.completed && (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold leading-tight
            ${task.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>
            {task.action}
          </p>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
            {task.deadline && (
              <span>Due: {new Date(task.deadline).toLocaleDateString()}</span>
            )}
            {task.sourceUrl && task.sourceUrl !== 'clipboard' && (
              <a href={task.sourceUrl} target="_blank" className="text-indigo-500 hover:underline truncate">
                source
              </a>
            )}
          </div>
        </div>

        {/* Badges + Delete */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <VerifyBadge txHash={task.txHash} />
          <button
            onClick={() => onDelete(task.id)}
            className="text-gray-300 hover:text-red-500 transition-colors p-0.5"
            title="Delete task"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
```

### VerifyBadge Component

```tsx
// entrypoints/popup/components/VerifyBadge.tsx

const EXPLORER_BASE = 'https://explorer.opengradient.ai/tx/';

interface VerifyBadgeProps {
  txHash: string | null;
}

function VerifyBadge({ txHash }: VerifyBadgeProps) {
  if (!txHash) {
    // TEE inference ran but no on-chain proof yet (batch settlement pending, or hash unavailable)
    return (
      <span
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500"
        title="Processed in TEE -- on-chain proof pending"
      >
        TEE
      </span>
    );
  }

  return (
    <a
      href={`${EXPLORER_BASE}${txHash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors no-underline"
      title={`On-chain proof: ${txHash}`}
    >
      {/* Shield/checkmark icon */}
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
      Verified
    </a>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline styles in JSX | Tailwind CSS 4 utility classes | Already configured but unused | Must migrate during this phase |
| MemSync cloud sync | chrome.storage.local only | Phase 2 (02-03) decision | Simplifies storage -- all local |
| Individual settlement | Batch settlement | Phase 2 (02-03) decision | txHash may still be present in x-payment-response header |
| Content scripts | Clipboard extraction | Phase 2 (02-03) decision | sourceUrl is always "clipboard" for now |
| memsyncId/synced fields | No cloud sync | Phase 2 (02-03) decision | Remove dead fields from Task interface |

**Deprecated/outdated:**
- `memsyncId` and `synced` fields on Task: MemSync was removed. These should be cleaned up.
- `extractTasksFromImage` with vision model: OCR now happens on proxy, so all LLM calls receive text. The image extraction path still exists but is unused since OCR handles it.

## OpenGradient Explorer and TEE Verification Details

### Explorer URL Pattern
The existing code uses: `https://explorer.opengradient.ai/tx/${txHash}`

This is already in App.tsx (line 430). This is the standard block explorer pattern (like etherscan) and should be correct. The explorer is a Next.js app. (Confidence: MEDIUM -- URL pattern is already in use in the codebase and follows standard conventions, but could not directly verify the explorer renders transaction details at this path.)

### x-payment-response Header Format
The `x-payment-response` header is base64-encoded JSON with this structure:
```json
{
  "success": true,
  "transaction": "0x8f3d1a2b...",
  "network": "eip155:84532",
  "payer": "0x1234...",
  "errorReason": null
}
```
The `transaction` field is the on-chain hash. This is already correctly parsed in `opengradient.ts` (lines 234-243).

### TEE Attestation Status
OpenGradient runs ALL LLM inference inside TEE (AWS Nitro Enclaves). There is no per-request "attestation status" field returned to the client. The TEE guarantee is architectural -- if the inference succeeded, it ran in a TEE. The on-chain proof (txHash) confirms the payment was settled, which indirectly confirms the inference was executed and recorded.

For the UI, this means:
- **Every successful inference is TEE-verified by design** -- show a TEE badge always
- **txHash present** = on-chain settlement proof exists -- show "Verified" with explorer link
- **txHash null** = inference ran in TEE but no on-chain hash available (batch pending or header missing) -- show "TEE" badge without link

### Badge States (3-tier)
1. **Green "Verified" badge with shield icon** -- txHash exists, links to explorer
2. **Gray "TEE" badge** -- inference ran in TEE but no on-chain hash (batch settlement)
3. **No badge** -- should not occur if task came from LLM pipeline (every extraction goes through TEE)

## Open Questions

1. **Explorer URL verification**
   - What we know: Code uses `https://explorer.opengradient.ai/tx/${txHash}` and it follows standard patterns
   - What's unclear: Whether the explorer actually renders a useful page at this URL (it's a Next.js SSR app, may have different routing)
   - Recommendation: Keep the URL pattern as-is. During implementation, test with a real txHash from a completed extraction. If the explorer URL pattern is wrong, it's a 1-line fix.

2. **Batch settlement txHash availability**
   - What we know: With batch settlement (`X-SETTLEMENT-TYPE: batch`), the server still returns `x-payment-response` header
   - What's unclear: Whether the hash in batch mode refers to the batch transaction or is empty/null
   - Recommendation: Handle both cases in the UI (hash present = show link, hash absent = show TEE-only badge). The current code already handles null txHash.

3. **Task storage performance at scale**
   - What we know: chrome.storage.local has ~5MB quota for extensions, each task is ~500 bytes
   - What's unclear: Performance with thousands of tasks (read-modify-write of full array)
   - Recommendation: Not a concern for Phase 3 scope (~100s of tasks). If needed later, batch operations or indexing can be added.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** -- All existing files read directly: App.tsx, types.ts, storage.ts, background.ts, opengradient.ts, task-extractor.ts, proxy.mjs, wxt.config.ts, package.json, style.css
- **Phase 2 Summary** (.planning/phases/02-extraction-ai-storage-pipeline/02-03-SUMMARY.md) -- Confirms pivots, current architecture
- [chrome.storage API - Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/api/storage) -- Storage API patterns, limitations, onChanged listener

### Secondary (MEDIUM confidence)
- [x402 X-PAYMENT-RESPONSE - Avalanche Builder Hub](https://build.avax.network/academy/blockchain/x402-payment-infrastructure/03-technical-architecture/04-x-payment-response-header) -- Response header JSON structure
- [OpenGradient Architecture Docs](https://docs.opengradient.ai/learn/architecture/) -- TEE attestation is architectural, all inference runs in TEE
- [OpenGradient x402 Blog Post](https://www.opengradient.ai/blog/x402-opengradient-upgrade-trustless-verifiable-inference) -- Settlement types, TEE integration details
- [Chrome Extension Popup Dimensions](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/3A8d3oiOV_E) -- Max 800x600px

### Tertiary (LOW confidence)
- Explorer URL format (`explorer.opengradient.ai/tx/{hash}`) -- inferred from existing code + standard patterns, not directly verified against live explorer

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, everything already installed and configured
- Architecture: HIGH -- extending existing patterns (message passing, storage helpers, component structure)
- CRUD operations: HIGH -- straightforward read-modify-write on chrome.storage.local
- TEE verification display: MEDIUM -- attestation is architectural (always TEE), but txHash availability with batch settlement is partially unclear
- Explorer URL: MEDIUM -- URL pattern exists in code and follows conventions, but not directly verified

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable -- no fast-moving dependencies, all libraries locked)

import { createX402Client, testLLMCall, extractTasksWithProof, transcribeAudio } from "@/lib/opengradient";
import { type Task, generateTaskId } from "@/lib/types";
import { saveTasksLocally, getLocalTasks, updateTask, deleteTask } from "@/lib/storage";
import { syncTasksToMemSync } from "@/lib/memsync";

const REMINDER_PREFIX = "reminder_";

export default defineBackground(() => {
  console.log("[background] Service worker initialized", {
    id: browser.runtime.id,
  });

  // ---------------------------------------------------------------
  // ALARMS: Page-independent reminder system
  // Registered synchronously at top level — critical for MV3.
  // ---------------------------------------------------------------
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    console.log("[background] Alarm fired:", alarm.name);

    // Periodic fallback: check all tasks for due reminders
    if (alarm.name === "periodic_check") {
      await syncAlarms();
      return;
    }

    if (!alarm.name.startsWith(REMINDER_PREFIX)) return;

    const taskId = alarm.name.slice(REMINDER_PREFIX.length);

    try {
      const { tasks = [] } = await chrome.storage.local.get("tasks") as { tasks?: Task[] };
      const task = tasks.find(t => t.id === taskId);

      if (!task) {
        console.log("[background] Task not found for alarm:", taskId);
        return;
      }

      console.log("[background] Showing notification for:", task.action);

      // Show system notification (works without any page open)
      const notifMessage = task.reminderNote
        ? `${task.action}\n${task.reminderNote}`
        : task.action;
      chrome.notifications.create(REMINDER_PREFIX + task.id, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("/icon/128.png"),
        title: "Task Reminder",
        message: notifMessage,
        priority: 2,
        requireInteraction: true,
      });

      // Play sound via offscreen document
      try {
        await ensureOffscreen();
        chrome.runtime.sendMessage({ type: "PLAY_REMINDER_SOUND" }).catch(() => {});
      } catch (e) {
        console.log("[background] Offscreen sound failed:", e);
      }

      // Clear reminderAt so it doesn't fire again
      const updated = tasks.map(t => t.id === task.id ? { ...t, reminderAt: null } : t);
      await chrome.storage.local.set({ tasks: updated });

    } catch (err) {
      console.error("[background] Alarm handler error:", err);
    }
  });

  // ---------------------------------------------------------------
  // NOTIFICATIONS: Click handler — open popup and highlight task
  // ---------------------------------------------------------------
  chrome.notifications.onClicked.addListener(async (notificationId) => {
    console.log("[background] Notification clicked:", notificationId);

    if (notificationId.startsWith(REMINDER_PREFIX)) {
      const taskId = notificationId.slice(REMINDER_PREFIX.length);
      await chrome.storage.local.set({ highlightTaskId: taskId });
      try {
        await chrome.action.openPopup();
      } catch {
        await chrome.tabs.create({ url: chrome.runtime.getURL("/popup.html") });
      }
    }

    chrome.notifications.clear(notificationId);
  });

  // ---------------------------------------------------------------
  // Offscreen document for sound playback
  // ---------------------------------------------------------------
  async function ensureOffscreen() {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
    });
    if (contexts.length > 0) return;
    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL("/offscreen.html"),
      reasons: ["AUDIO_PLAYBACK" as chrome.offscreen.Reason],
      justification: "Play reminder sound",
    });
  }

  // ---------------------------------------------------------------
  // Startup: re-create alarms for any pending reminders
  // (Service worker may restart, losing in-memory alarms)
  // ---------------------------------------------------------------
  async function syncAlarms() {
    console.log("[background] Syncing alarms...");
    try {
      const { tasks = [] } = await chrome.storage.local.get("tasks") as { tasks?: Task[] };
      const existingAlarms = await chrome.alarms.getAll();
      const existingNames = new Set(existingAlarms.map(a => a.name));

      for (const task of tasks) {
        if (!task.reminderAt) continue;
        const alarmName = REMINDER_PREFIX + task.id;
        if (existingNames.has(alarmName)) continue;

        const when = new Date(task.reminderAt).getTime();
        if (when <= Date.now()) {
          // Already past due — fire immediately
          console.log("[background] Past-due reminder, firing now:", task.action);
          chrome.notifications.create(alarmName, {
            type: "basic",
            iconUrl: chrome.runtime.getURL("/icon/128.png"),
            title: "Task Reminder",
            message: task.action,
            priority: 2,
            requireInteraction: true,
          });
          const updated = tasks.map(t => t.id === task.id ? { ...t, reminderAt: null } : t);
          await chrome.storage.local.set({ tasks: updated });
        } else {
          console.log("[background] Creating alarm for:", task.action, "at", task.reminderAt);
          chrome.alarms.create(alarmName, { when });
        }
      }
    } catch (err) {
      console.error("[background] syncAlarms error:", err);
    }
  }

  // Sync on startup
  syncAlarms();

  // Also sync on install/update
  browser.runtime.onInstalled.addListener((details) => {
    console.log("[background] Extension installed/updated:", details.reason);
    syncAlarms();
  });

  browser.runtime.onStartup.addListener(() => {
    console.log("[background] Browser startup");
    syncAlarms();
  });

  // ---------------------------------------------------------------
  // Periodic fallback: check every 30 seconds via alarm
  // In case individual alarms don't fire, this catches stragglers.
  // ---------------------------------------------------------------
  chrome.alarms.create("periodic_check", { periodInMinutes: 0.5 });

  // ---------------------------------------------------------------
  // VOICE INPUT: Recording runs in content script on the active page.
  // Content script sends VOICE_STARTED / VOICE_DONE messages.
  // Background handles processing transcript from storage.
  // ---------------------------------------------------------------
  let processingVoice = false;
  let voiceRecordingTabId: number | null = null;

  async function processVoiceTranscript() {
    if (processingVoice) {
      console.log("[background] processVoice: already processing, skip");
      return;
    }
    processingVoice = true;

    try {
      const { voiceTranscript = "" } = await chrome.storage.local.get("voiceTranscript") as { voiceTranscript?: string };
      const text = (voiceTranscript || "").trim();
      await chrome.storage.local.remove("voiceTranscript");

      if (!text) {
        console.log("[background] processVoice: empty, nothing to do");
        return;
      }

      console.log("[background] processVoice: text =", text.slice(0, 60));
      chrome.notifications.create("voice_processing", {
        type: "basic",
        iconUrl: chrome.runtime.getURL("/icon/128.png"),
        title: "Voice Input",
        message: `Processing: "${text.slice(0, 50)}..."`,
        priority: 1,
      });

      // x402 requires private key for payment signing
      const { ogPrivateKey } = await chrome.storage.local.get("ogPrivateKey");
      if (!ogPrivateKey) {
        throw new Error("Enter your wallet private key in Settings to use AI extraction");
      }
      const x402Fetch = createX402Client(ogPrivateKey as `0x${string}`);
      const { rawTasks, txHash } = await extractTasksWithProof(x402Fetch, text);
      const seenActions = new Set<string>();
      const enrichedTasks: Task[] = [];
      for (const raw of rawTasks) {
        const key = raw.action.trim().toLowerCase();
        if (seenActions.has(key)) continue;
        seenActions.add(key);
        enrichedTasks.push({
          ...raw,
          id: generateTaskId("voice-input", raw.action),
          sourceUrl: "voice-input",
          platform: "clipboard" as Task["platform"],
          createdAt: new Date().toISOString(),
          txHash,
          completed: false,
          completedAt: null,
          reminderAt: null,
          reminderNote: null,
          tags: raw.category && raw.category !== "general" ? [raw.category] : [],
        });
      }
      await saveTasksLocally(enrichedTasks);
      syncTasksToMemSync(enrichedTasks).catch(console.warn);
      chrome.notifications.clear("voice_processing");
      chrome.notifications.create("voice_ok", {
        type: "basic",
        iconUrl: chrome.runtime.getURL("/icon/128.png"),
        title: "Voice Input",
        message: `Saved ${enrichedTasks.length} item(s)`,
        priority: 1,
      });
    } catch (err) {
      console.error("[background] Voice extraction error:", err);
      chrome.notifications.clear("voice_processing");
      chrome.notifications.create("voice_err", {
        type: "basic",
        iconUrl: chrome.runtime.getURL("/icon/128.png"),
        title: "Voice Input Failed",
        message: err instanceof Error ? err.message : String(err),
        priority: 1,
      });
    } finally {
      processingVoice = false;
    }
  }

  // Process voice audio: transcribe via Whisper, then extract tasks
  async function processVoiceAudio() {
    try {
      const { voiceAudioData, voiceLang } =
        await chrome.storage.local.get(["voiceAudioData", "voiceLang"]);
      await chrome.storage.local.remove("voiceAudioData");

      if (!voiceAudioData) {
        console.log("[background] processVoiceAudio: no audio data");
        return;
      }

      console.log("[background] Transcribing audio...");
      chrome.notifications.create("voice_transcribing", {
        type: "basic",
        iconUrl: chrome.runtime.getURL("/icon/128.png"),
        title: "Voice Input",
        message: "Transcribing audio...",
        priority: 1,
      });

      const lang = (voiceLang as string) || "ru-RU";

      // Step 1: Transcribe audio via Groq Whisper (free)
      const text = await transcribeAudio(voiceAudioData as string, lang);
      chrome.notifications.clear("voice_transcribing");

      if (!text.trim()) {
        console.log("[background] Whisper returned empty text");
        chrome.notifications.create("voice_err", {
          type: "basic",
          iconUrl: chrome.runtime.getURL("/icon/128.png"),
          title: "Voice Input",
          message: "No speech detected in recording",
          priority: 1,
        });
        return;
      }

      console.log("[background] Transcribed:", text.slice(0, 60));

      // Step 2: Extract tasks from transcribed text
      await chrome.storage.local.set({ voiceTranscript: text.trim() });
      await processVoiceTranscript();

    } catch (err) {
      console.error("[background] Voice audio processing failed:", err);
      chrome.notifications.clear("voice_transcribing");
      chrome.notifications.create("voice_err", {
        type: "basic",
        iconUrl: chrome.runtime.getURL("/icon/128.png"),
        title: "Voice Input Failed",
        message: err instanceof Error ? err.message : String(err),
        priority: 1,
      });
    }
  }

  // Send START/STOP to content script in active tab
  async function sendToActiveTab(type: string): Promise<boolean> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.id || tab.url?.startsWith("chrome://") || tab.url?.startsWith("edge://") || tab.url?.startsWith("about:")) {
        console.log("[background] No suitable tab for voice");
        return false;
      }
      await chrome.tabs.sendMessage(tab.id, { type });
      if (type === "START_RECORDING") voiceRecordingTabId = tab.id;
      if (type === "STOP_RECORDING") voiceRecordingTabId = null;
      return true;
    } catch (err) {
      console.error("[background] sendToActiveTab failed:", err);
      return false;
    }
  }

  // chrome.commands — toggle (for global shortcut)
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== "voice-input") return;
    console.log("[background] Voice command (toggle)");
    if (voiceRecordingTabId) {
      await sendToActiveTab("STOP_RECORDING");
    } else {
      await sendToActiveTab("START_RECORDING");
    }
  });

  // Handle messages from popup, offscreen, or content scripts
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== "CHECK_REMINDERS" && message.type !== "PLAY_REMINDER_SOUND") {
      console.log("[background] Received message:", message.type);
    }

    // ---------------------------------------------------------------
    // OPEN_POPUP: Content script requests to open popup after reminder click
    // ---------------------------------------------------------------
    if (message.type === "OPEN_POPUP") {
      (async () => {
        if (message.taskId) {
          await chrome.storage.local.set({ highlightTaskId: message.taskId });
        }
        try {
          await chrome.action.openPopup();
        } catch {
          await chrome.tabs.create({ url: chrome.runtime.getURL("/popup.html") });
        }
        sendResponse({ ok: true });
      })();
      return true;
    }

    // ---------------------------------------------------------------
    // VOICE: Content script notifications + popup toggle
    // ---------------------------------------------------------------
    if (message.type === "VOICE_STARTED") {
      voiceRecordingTabId = _sender.tab?.id ?? null;
      chrome.action.setBadgeText({ text: "REC" });
      chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
      console.log("[background] Voice recording started on tab:", voiceRecordingTabId);
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "VOICE_DONE") {
      console.log("[background] Voice recording done, processing transcript");
      voiceRecordingTabId = null;
      chrome.action.setBadgeText({ text: "" });
      processVoiceTranscript();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "VOICE_AUDIO_READY") {
      console.log("[background] Voice audio ready, starting transcription pipeline");
      voiceRecordingTabId = null;
      chrome.action.setBadgeText({ text: "" });
      processVoiceAudio();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "TOGGLE_VOICE") {
      (async () => {
        try {
          if (voiceRecordingTabId) {
            const ok = await sendToActiveTab("STOP_RECORDING");
            sendResponse({ success: ok });
          } else {
            const ok = await sendToActiveTab("START_RECORDING");
            if (!ok) {
              sendResponse({ success: false, error: "Navigate to a web page first" });
            } else {
              sendResponse({ success: true });
            }
          }
        } catch (err) {
          sendResponse({ success: false, error: String(err) });
        }
      })();
      return true;
    }

    // ---------------------------------------------------------------
    // EXTRACT_FROM_CLIPBOARD: Popup sends clipboard content (text or image base64)
    // ---------------------------------------------------------------
    if (message.type === "EXTRACT_FROM_CLIPBOARD") {
      (async () => {
        try {
          // 1. Get private key (required for x402 payment)
          const { ogPrivateKey } = await chrome.storage.local.get("ogPrivateKey");
          if (!ogPrivateKey) {
            sendResponse({ success: false, error: "Enter your wallet private key in Settings to use AI extraction" });
            return;
          }

          const x402Fetch = createX402Client(ogPrivateKey as `0x${string}`);

          // 2. Call LLM via x402 OpenGradient TEE
          // Images are OCR'd in popup before reaching here — always text
          const { rawTasks, txHash } = await extractTasksWithProof(x402Fetch, message.text);

          // 3. Enrich tasks + dedup within batch by normalized action
          const sourceUrl = message.sourceMeta?.url || "clipboard";
          const platform = message.sourceMeta?.platform || "clipboard";
          const seenActions = new Set<string>();
          const enrichedTasks: Task[] = [];
          for (const raw of rawTasks) {
            const key = raw.action.trim().toLowerCase();
            if (seenActions.has(key)) continue;
            seenActions.add(key);
            enrichedTasks.push({
              ...raw,
              id: generateTaskId(sourceUrl, raw.action),
              sourceUrl,
              platform: platform as Task["platform"],
              createdAt: new Date().toISOString(),
              txHash,
              completed: false,
              completedAt: null,
              reminderAt: null,
              reminderNote: null,
              tags: raw.category && raw.category !== "general" ? [raw.category] : [],
            });
          }

          // 4. Save locally
          await saveTasksLocally(enrichedTasks);

          // 5. Sync to MemSync (fire-and-forget)
          syncTasksToMemSync(enrichedTasks).catch(console.warn);

          // 6. Respond to popup
          sendResponse({ success: true, tasks: enrichedTasks, txHash });
        } catch (err: unknown) {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
      return true;
    }

    // ---------------------------------------------------------------
    // GET_TASKS: Let the popup retrieve stored tasks
    // ---------------------------------------------------------------
    if (message.type === "GET_TASKS") {
      getLocalTasks()
        .then((tasks) => sendResponse({ success: true, tasks }))
        .catch((err) => sendResponse({ success: false, error: String(err) }));
      return true;
    }

    // ---------------------------------------------------------------
    // TEST_X402: Validate x402 gateway connectivity (Phase 1 test)
    // ---------------------------------------------------------------
    if (message.type === "TEST_X402") {
      (async () => {
        try {
          const { ogPrivateKey } =
            await chrome.storage.local.get("ogPrivateKey");
          if (!ogPrivateKey) {
            sendResponse({
              success: false,
              error: "No private key configured. Enter it in the popup.",
            });
            return;
          }

          const x402Fetch = createX402Client(
            ogPrivateKey as `0x${string}`,
          );
          const result = await testLLMCall(x402Fetch);
          sendResponse(result);
        } catch (err: unknown) {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
      return true;
    }

    // ---------------------------------------------------------------
    // SAVE_PRIVATE_KEY: Store wallet key in session storage
    // ---------------------------------------------------------------
    if (message.type === "SAVE_PRIVATE_KEY") {
      chrome.storage.local
        .set({ ogPrivateKey: message.key })
        .then(() => sendResponse({ success: true }))
        .catch((err: Error) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    // ---------------------------------------------------------------
    // SAVE_MEMSYNC_KEY: Store MemSync API key
    // ---------------------------------------------------------------
    if (message.type === "SAVE_MEMSYNC_KEY") {
      const value = (message.key as string)?.trim();
      (value
        ? chrome.storage.local.set({ memsyncApiKey: value })
        : chrome.storage.local.remove("memsyncApiKey")
      )
        .then(() => sendResponse({ success: true }))
        .catch((err: Error) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    // ---------------------------------------------------------------
    // SET_REMINDER: Create alarm + update storage
    // ---------------------------------------------------------------
    if (message.type === "SET_REMINDER") {
      (async () => {
        try {
          await updateTask(message.taskId, { reminderAt: message.reminderAt, reminderNote: message.reminderNote ?? null });
          const when = new Date(message.reminderAt).getTime();
          const alarmName = REMINDER_PREFIX + message.taskId;
          await chrome.alarms.create(alarmName, { when });
          console.log("[background] Alarm created:", alarmName, "when:", message.reminderAt);
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: String(err) });
        }
      })();
      return true;
    }

    // ---------------------------------------------------------------
    // CLEAR_REMINDER: Remove alarm + update storage
    // ---------------------------------------------------------------
    if (message.type === "CLEAR_REMINDER") {
      (async () => {
        try {
          await updateTask(message.taskId, { reminderAt: null });
          await chrome.alarms.clear(REMINDER_PREFIX + message.taskId);
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: String(err) });
        }
      })();
      return true;
    }

    // ---------------------------------------------------------------
    // COMPLETE_TASK: Toggle task completion state
    // ---------------------------------------------------------------
    if (message.type === "COMPLETE_TASK") {
      (async () => {
        try {
          const tasks = await getLocalTasks();
          const task = tasks.find((t) => t.id === message.taskId);
          if (!task) {
            sendResponse({ success: false, error: "Task not found" });
            return;
          }
          const completed = !task.completed;
          const completedAt = completed ? new Date().toISOString() : null;
          await updateTask(message.taskId, { completed, completedAt });
          sendResponse({ success: true });
        } catch (err: unknown) {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
      return true;
    }

    // ---------------------------------------------------------------
    // DELETE_TASK: Remove a task from storage
    // ---------------------------------------------------------------
    if (message.type === "DELETE_TASK") {
      (async () => {
        try {
          console.log("[background] DELETE_TASK received, taskId:", message.taskId);
          await chrome.alarms.clear(REMINDER_PREFIX + message.taskId);
          await deleteTask(message.taskId);
          const remaining = await getLocalTasks();
          console.log("[background] DELETE_TASK done, remaining tasks:", remaining.length);
          sendResponse({ success: true });
        } catch (err: unknown) {
          console.error("[background] DELETE_TASK error:", err);
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
      return true;
    }

    // ---------------------------------------------------------------
    // TOGGLE_SOUND: Toggle reminder sound on/off
    // ---------------------------------------------------------------
    if (message.type === "TOGGLE_SOUND") {
      (async () => {
        try {
          const { soundEnabled = true } = await chrome.storage.local.get("soundEnabled") as { soundEnabled?: boolean };
          const newValue = !soundEnabled;
          await chrome.storage.local.set({ soundEnabled: newValue });
          sendResponse({ success: true, soundEnabled: newValue });
        } catch (err: unknown) {
          sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
      })();
      return true;
    }

    // ---------------------------------------------------------------
    // PING: Health check
    // ---------------------------------------------------------------
    if (message.type === "PING") {
      sendResponse({ status: "alive", timestamp: Date.now() });
    }
  });
});

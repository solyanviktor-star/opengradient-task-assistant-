import { createX402Client, testLLMCall, extractTasksWithProof, extractTasksFromImage } from "@/lib/opengradient";
import { type Task, generateTaskId } from "@/lib/types";
import { saveTasksLocally, getLocalTasks, updateTask, deleteTask } from "@/lib/storage";

export default defineBackground(() => {
  console.log("[background] Service worker initialized", {
    id: browser.runtime.id,
  });

  // Handle extension install/update
  browser.runtime.onInstalled.addListener((details) => {
    console.log("[background] Extension installed/updated:", details.reason);
  });

  // Handle messages from popup or content scripts
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    console.log("[background] Received message:", message.type);

    // ---------------------------------------------------------------
    // EXTRACT_FROM_CLIPBOARD: Popup sends clipboard content (text or image base64)
    // ---------------------------------------------------------------
    if (message.type === "EXTRACT_FROM_CLIPBOARD") {
      (async () => {
        try {
          // 1. Get private key
          const { ogPrivateKey } = await chrome.storage.local.get("ogPrivateKey");
          if (!ogPrivateKey) {
            sendResponse({ success: false, error: "No private key configured" });
            return;
          }

          const x402Fetch = createX402Client(ogPrivateKey as `0x${string}`);
          let rawTasks;
          let txHash: string | null;

          // 2. Call LLM via x402 -- text or image
          if (message.inputType === "image") {
            // Vision: send screenshot to GPT-4o
            ({ rawTasks, txHash } = await extractTasksFromImage(x402Fetch, message.imageBase64));
          } else {
            // Text: send to Claude 4.0 Sonnet
            ({ rawTasks, txHash } = await extractTasksWithProof(x402Fetch, message.text));
          }

          // 3. Enrich tasks
          const enrichedTasks: Task[] = rawTasks.map((raw) => ({
            ...raw,
            id: generateTaskId("clipboard", raw.action),
            sourceUrl: "clipboard",
            platform: "clipboard" as const,
            createdAt: new Date().toISOString(),
            txHash,
            completed: false,
            completedAt: null,
          }));

          // 4. Save locally
          await saveTasksLocally(enrichedTasks);

          // 5. Respond to popup
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
    // PING: Health check
    // ---------------------------------------------------------------
    if (message.type === "PING") {
      sendResponse({ status: "alive", timestamp: Date.now() });
    }
  });
});

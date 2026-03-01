import { createX402Client, testLLMCall, extractTasksWithProof } from "@/lib/opengradient";
import { type Task, generateTaskId } from "@/lib/types";
import { saveTasksLocally, syncToMemSync, getLocalTasks } from "@/lib/storage";

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
    // TRIGGER_EXTRACTION: Full pipeline -- content script -> LLM -> storage
    // ---------------------------------------------------------------
    if (message.type === "TRIGGER_EXTRACTION") {
      (async () => {
        try {
          // 1. Get active tab
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) {
            sendResponse({ success: false, error: "No active tab" });
            return;
          }

          // 2. Ask content script to extract text
          const extraction = await browser.tabs.sendMessage(tab.id, {
            type: "TRIGGER_EXTRACTION",
            platform: message.platform ?? "selection",
          });

          if (!extraction?.text?.trim()) {
            sendResponse({
              success: false,
              error: "No text found. Select text or open a Telegram chat.",
            });
            return;
          }

          // 3. Get private key
          const { ogPrivateKey } = await chrome.storage.session.get("ogPrivateKey");
          if (!ogPrivateKey) {
            sendResponse({ success: false, error: "No private key configured" });
            return;
          }

          // 4. Call LLM via x402
          const x402Fetch = createX402Client(ogPrivateKey as `0x${string}`);
          const { rawTasks, txHash } = await extractTasksWithProof(x402Fetch, extraction.text);

          // 5. Enrich tasks
          const enrichedTasks: Task[] = rawTasks.map((raw) => ({
            ...raw,
            id: generateTaskId(extraction.url ?? tab.url ?? "", raw.action),
            sourceUrl: extraction.url ?? tab.url ?? "",
            platform: extraction.platform ?? "other",
            createdAt: new Date().toISOString(),
            txHash,
            memsyncId: null,
            synced: false,
          }));

          // 6. Save locally
          await saveTasksLocally(enrichedTasks);

          // 7. Async sync to MemSync (don't block response)
          syncToMemSync(enrichedTasks).catch((err) =>
            console.warn("[background] MemSync sync failed:", err),
          );

          // 8. Respond to popup
          sendResponse({ success: true, tasks: enrichedTasks, txHash });
        } catch (err: unknown) {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
      return true; // Keep message channel open for async sendResponse
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
    // SAVE_MEMSYNC_KEY: Persist MemSync API key to chrome.storage.local
    // ---------------------------------------------------------------
    if (message.type === "SAVE_MEMSYNC_KEY") {
      chrome.storage.local
        .set({ memsyncApiKey: message.key })
        .then(() => sendResponse({ success: true }))
        .catch((err: Error) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    // ---------------------------------------------------------------
    // TEST_X402: Validate x402 gateway connectivity (Phase 1 test)
    // ---------------------------------------------------------------
    if (message.type === "TEST_X402") {
      (async () => {
        try {
          const { ogPrivateKey } =
            await chrome.storage.session.get("ogPrivateKey");
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
      chrome.storage.session
        .set({ ogPrivateKey: message.key })
        .then(() => sendResponse({ success: true }))
        .catch((err: Error) =>
          sendResponse({ success: false, error: err.message }),
        );
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

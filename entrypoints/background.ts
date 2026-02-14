import { createX402Client, testLLMCall } from "@/lib/opengradient";

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

    if (message.type === "TEST_X402") {
      (async () => {
        try {
          // Read private key from session storage (never hardcode!)
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
      return true; // Keep message channel open for async sendResponse
    }

    if (message.type === "SAVE_PRIVATE_KEY") {
      chrome.storage.session
        .set({ ogPrivateKey: message.key })
        .then(() => sendResponse({ success: true }))
        .catch((err: Error) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true; // Keep message channel open for async sendResponse
    }

    if (message.type === "PING") {
      sendResponse({ status: "alive", timestamp: Date.now() });
    }
  });
});

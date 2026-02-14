export default defineBackground(() => {
  console.log('[background] Service worker initialized', {
    id: browser.runtime.id,
  });

  // Handle extension install/update
  browser.runtime.onInstalled.addListener((details) => {
    console.log('[background] Extension installed/updated:', details.reason);
  });

  // Handle messages from popup or content scripts
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ status: 'alive', timestamp: Date.now() });
    }
  });
});

import type { TriggerExtractionMessage, TriggerExtractionResponse } from '@/lib/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    console.log('[selection] Content script loaded on', window.location.href);

    // Listen for extraction trigger from background/popup
    browser.runtime.onMessage.addListener(
      (message: TriggerExtractionMessage, _sender, sendResponse) => {
        if (message.type !== 'TRIGGER_EXTRACTION') return;

        // Only respond to selection-targeted triggers or triggers with no platform specified.
        // Avoid responding when a platform-specific trigger is sent (e.g., 'telegram').
        if (message.platform && message.platform !== 'selection') return;

        console.log('[selection] Extraction triggered');

        const selection = window.getSelection();
        const selectedText = selection?.toString().trim() ?? '';

        const response: TriggerExtractionResponse = {
          text: selectedText,
          url: window.location.href,
          platform: 'selection',
        };
        sendResponse(response);

        // Send EXTRACT_TASKS to background if we got text
        if (selectedText) {
          console.log(`[selection] Extracted ${selectedText.length} chars of selected text`);
          browser.runtime.sendMessage({
            type: 'EXTRACT_TASKS',
            payload: {
              text: selectedText,
              sourceUrl: window.location.href,
              platform: 'selection' as const,
            },
          }).catch((err: unknown) => {
            console.warn('[selection] Failed to send EXTRACT_TASKS:', err);
          });
        } else {
          console.log('[selection] No text selected');
        }

        return true; // Keep message channel open for async sendResponse
      },
    );
  },
});

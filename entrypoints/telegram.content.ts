import type { TriggerExtractionMessage, TriggerExtractionResponse } from '@/lib/types';

export default defineContentScript({
  matches: ['*://web.telegram.org/*'],
  runAt: 'document_idle',

  main() {
    console.log('[telegram] Content script loaded on', window.location.href);

    // Listen for extraction trigger from background/popup
    browser.runtime.onMessage.addListener(
      (message: TriggerExtractionMessage, _sender, sendResponse) => {
        if (message.type !== 'TRIGGER_EXTRACTION') return;

        // Only respond to telegram-targeted triggers (or triggers with no platform specified)
        if (message.platform && message.platform !== 'telegram') return;

        console.log('[telegram] Extraction triggered');
        const { text, strategy } = extractVisibleMessages();
        console.log(`[telegram] Extracted ${text.length} chars using strategy: ${strategy}`);

        const response: TriggerExtractionResponse = {
          text,
          url: window.location.href,
          platform: 'telegram',
        };
        sendResponse(response);

        // Also send EXTRACT_TASKS to background if we got text
        if (text.trim()) {
          browser.runtime.sendMessage({
            type: 'EXTRACT_TASKS',
            payload: {
              text,
              sourceUrl: window.location.href,
              platform: 'telegram' as const,
            },
          }).catch((err: unknown) => {
            console.warn('[telegram] Failed to send EXTRACT_TASKS:', err);
          });
        }

        return true; // Keep message channel open for async sendResponse
      },
    );
  },
});

interface ExtractionResult {
  text: string;
  strategy: string;
}

/**
 * Extract visible messages from the current Telegram Web A chat.
 * Uses a multi-strategy approach, falling back gracefully if preferred selectors fail.
 */
function extractVisibleMessages(): ExtractionResult {
  // Strategy 1 (preferred): Use stable data-message-id attributes as anchor,
  // navigate to parent .Message ancestor, find .text-content within it.
  const messageMarkers = document.querySelectorAll('[data-message-id]');
  if (messageMarkers.length > 0) {
    const texts: string[] = [];
    for (const marker of messageMarkers) {
      // Navigate up to the .Message ancestor
      const messageEl = marker.closest('.Message') ?? marker.parentElement?.closest('.Message');
      if (messageEl) {
        const textContent = messageEl.querySelector('.text-content');
        const content = textContent?.textContent?.trim();
        if (content) {
          texts.push(content);
        }
      }
    }
    if (texts.length > 0) {
      console.log(`[telegram] Strategy 1: found ${texts.length} messages via data-message-id`);
      return { text: texts.join('\n\n'), strategy: 'data-message-id' };
    }
  }

  // Strategy 2 (fallback): Query .text-content elements directly inside #MiddleColumn
  const middleColumn = document.querySelector('#MiddleColumn');
  if (middleColumn) {
    const textElements = middleColumn.querySelectorAll('.text-content');
    if (textElements.length > 0) {
      const texts = Array.from(textElements)
        .map(el => el.textContent?.trim() ?? '')
        .filter(Boolean);
      if (texts.length > 0) {
        console.log(`[telegram] Strategy 2: found ${texts.length} messages via .text-content`);
        return { text: texts.join('\n\n'), strategy: 'text-content-class' };
      }
    }
  }

  // Strategy 3 (last resort): Get innerText of #MiddleColumn or any chat container
  const chatContainer = document.querySelector('#MiddleColumn')
    ?? document.querySelector('[class*="chat"]');
  if (chatContainer) {
    const text = (chatContainer as HTMLElement).innerText?.trim() ?? '';
    if (text) {
      console.log(`[telegram] Strategy 3: extracted ${text.length} chars from chat container`);
      return { text, strategy: 'chat-container-innerText' };
    }
  }

  console.log('[telegram] No messages found with any strategy');
  return { text: '', strategy: 'none' };
}

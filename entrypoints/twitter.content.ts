/**
 * Twitter/X content script.
 * Injects an OG save button next to the bookmark button on every tweet.
 * On click: extracts tweet data, sends to background for AI structuring, button turns green.
 */

const OG_BUTTON_ATTR = "data-og-injected";
const SAVED_TWEETS_KEY = "og_saved_tweet_urls";

export default defineContentScript({
  matches: ["*://x.com/*", "*://twitter.com/*"],
  runAt: "document_idle",

  main() {
    console.log("[twitter] OG content script loaded");

    // Track saved tweet URLs in memory for instant green state
    const savedUrls = new Set<string>();

    // Load previously saved URLs from storage
    chrome.storage.local.get(SAVED_TWEETS_KEY).then((data) => {
      const urls: string[] = data[SAVED_TWEETS_KEY] || [];
      urls.forEach((u) => savedUrls.add(u));
    });

    function getTweetUrl(article: Element): string | null {
      // Tweet permalink is inside a <time> element's parent <a>
      const timeEl = article.querySelector("time[datetime]");
      const link = timeEl?.closest("a");
      if (link) {
        const href = link.getAttribute("href");
        if (href) return href.startsWith("http") ? href : `https://x.com${href}`;
      }
      return null;
    }

    function getTweetText(article: Element): string {
      const parts: string[] = [];

      // Author
      const nameEl = article.querySelector('[data-testid="User-Name"]');
      if (nameEl) parts.push(nameEl.textContent?.trim() || "");

      // Tweet body
      const textEl = article.querySelector('[data-testid="tweetText"]');
      if (textEl) parts.push(textEl.textContent?.trim() || "");

      // Quoted tweet
      const quoted = article.querySelector('[data-testid="quotedTweet"] [data-testid="tweetText"]');
      if (quoted) parts.push("[Quoted] " + (quoted.textContent?.trim() || ""));

      // Card / link preview
      const card = article.querySelector('[data-testid="card.wrapper"]');
      if (card) {
        const cardText = card.textContent?.trim();
        if (cardText) parts.push("[Card] " + cardText);
      }

      return parts.filter(Boolean).join("\n");
    }

    function createOGButton(article: Element): HTMLButtonElement {
      const btn = document.createElement("button");
      btn.setAttribute(OG_BUTTON_ATTR, "true");
      btn.title = "Save to OpenGradient";

      // Match Twitter's action button sizing
      Object.assign(btn.style, {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "34.75px",
        height: "34.75px",
        borderRadius: "9999px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        padding: "0",
        marginLeft: "2px",
        transition: "background-color 0.2s, color 0.2s",
        color: "rgb(113, 118, 123)",
      });

      // Lightning bolt SVG
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>`;

      // Hover effect
      btn.addEventListener("mouseenter", () => {
        if (!btn.dataset.saved) btn.style.color = "#6366f1";
      });
      btn.addEventListener("mouseleave", () => {
        if (!btn.dataset.saved) btn.style.color = "rgb(113, 118, 123)";
      });

      const tweetUrl = getTweetUrl(article);

      // If already saved, show green state
      if (tweetUrl && savedUrls.has(tweetUrl)) {
        markAsSaved(btn);
      }

      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (btn.dataset.saved) return; // Already saved

        const text = getTweetText(article);
        if (!text.trim()) {
          console.log("[twitter] No text found in tweet");
          return;
        }

        // Show loading state
        btn.style.color = "#6366f1";
        btn.style.opacity = "0.5";
        btn.style.pointerEvents = "none";

        try {
          const url = tweetUrl || window.location.href;

          const response = await browser.runtime.sendMessage({
            type: "EXTRACT_FROM_CLIPBOARD",
            inputType: "text",
            text: text,
            sourceMeta: { url, platform: "twitter" },
          });

          if (response?.success) {
            markAsSaved(btn);
            savedUrls.add(url);
            // Persist saved URLs
            chrome.storage.local.set({
              [SAVED_TWEETS_KEY]: [...savedUrls],
            });
          } else {
            // Error state — red flash then reset
            btn.style.color = "#ef4444";
            btn.style.opacity = "1";
            btn.style.pointerEvents = "auto";
            setTimeout(() => {
              btn.style.color = "rgb(113, 118, 123)";
            }, 2000);
            console.error("[twitter] Save failed:", response?.error);
          }
        } catch (err) {
          btn.style.color = "#ef4444";
          btn.style.opacity = "1";
          btn.style.pointerEvents = "auto";
          setTimeout(() => {
            btn.style.color = "rgb(113, 118, 123)";
          }, 2000);
          console.error("[twitter] Save error:", err);
        }
      });

      return btn;
    }

    function markAsSaved(btn: HTMLButtonElement) {
      btn.dataset.saved = "true";
      btn.style.color = "#22c55e";
      btn.style.opacity = "1";
      btn.style.pointerEvents = "none";
      btn.title = "Saved to OpenGradient";
    }

    function injectButtons() {
      const articles = document.querySelectorAll('article[data-testid="tweet"]');

      for (const article of articles) {
        // Skip if already injected
        if (article.querySelector(`[${OG_BUTTON_ATTR}]`)) continue;

        // Find the action bar (group with reply, retweet, like, bookmark)
        const actionGroup = article.querySelector('div[role="group"]');
        if (!actionGroup) continue;

        const btn = createOGButton(article);
        actionGroup.appendChild(btn);
      }
    }

    // Initial injection
    injectButtons();

    // Watch for new tweets (infinite scroll, navigation)
    const observer = new MutationObserver(() => {
      injectButtons();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  },
});

/**
 * Global hotkey listener + voice UI — runs on every page (ISOLATED world).
 * Push-to-talk: hold hotkey = record, release = stop & process.
 *
 * Audio is recorded in MAIN world (speech-bridge.content.ts) via MediaRecorder.
 * Communication via custom DOM events: __og_start, __og_stop, __og_audio, etc.
 * Background transcribes audio via Whisper API and extracts tasks.
 */

interface HotkeyConfig {
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

const DEFAULT_HOTKEY: HotkeyConfig = {
  code: "KeyV",
  ctrl: false,
  alt: true,
  shift: true,
  meta: false,
};

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  main() {
    let hotkey: HotkeyConfig = DEFAULT_HOTKEY;
    let isHolding = false;
    let isRecording = false;
    let overlay: HTMLElement | null = null;

    console.log("[hotkey] Content script loaded");

    // Load custom hotkey
    chrome.storage.local.get("customHotkey").then(({ customHotkey }) => {
      if (customHotkey) {
        hotkey = customHotkey as HotkeyConfig;
        console.log("[hotkey] Custom hotkey:", hotkey.code);
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.customHotkey?.newValue) {
        hotkey = changes.customHotkey.newValue as HotkeyConfig;
      }
    });

    function matchesCombo(code: string, ctrl: boolean, alt: boolean, shift: boolean, meta: boolean): boolean {
      return (
        hotkey.code === code &&
        hotkey.ctrl === ctrl &&
        hotkey.alt === alt &&
        hotkey.shift === shift &&
        hotkey.meta === meta
      );
    }

    // ---------------------------------------------------------------
    // Overlay (floating indicator on the page)
    // ---------------------------------------------------------------
    function showOverlay() {
      if (overlay) return;
      overlay = document.createElement("div");
      overlay.id = "__og_voice";
      overlay.setAttribute("style", [
        "position:fixed", "top:12px", "right:12px", "z-index:2147483647",
        "background:#1a1a2e", "color:#fff", "padding:8px 14px", "border-radius:10px",
        "font-family:system-ui,sans-serif", "font-size:13px",
        "display:flex", "align-items:center", "gap:8px",
        "box-shadow:0 4px 20px rgba(0,0,0,0.4)", "pointer-events:none",
      ].join(";"));
      overlay.innerHTML = `
        <div id="__og_dot" style="width:10px;height:10px;border-radius:50%;background:#ef4444;animation:__ogp 1s infinite;flex-shrink:0"></div>
        <span id="__og_text" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Recording...</span>
      `;
      const style = document.createElement("style");
      style.id = "__og_voice_style";
      style.textContent = "@keyframes __ogp{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.4)}}";
      document.documentElement.appendChild(style);
      document.documentElement.appendChild(overlay);
    }

    function updateOverlay(text: string) {
      const el = document.getElementById("__og_text");
      if (el) el.textContent = text;
    }

    function setOverlayDone() {
      const dot = document.getElementById("__og_dot");
      if (dot) { dot.style.background = "#22c55e"; dot.style.animation = "none"; }
      updateOverlay("Processing...");
    }

    function setOverlayError(msg: string) {
      const dot = document.getElementById("__og_dot");
      if (dot) { dot.style.background = "#f59e0b"; dot.style.animation = "none"; }
      updateOverlay(msg);
      setTimeout(hideOverlay, 4000);
    }

    function hideOverlay() {
      document.getElementById("__og_voice")?.remove();
      document.getElementById("__og_voice_style")?.remove();
      overlay = null;
    }

    // ---------------------------------------------------------------
    // Events from MAIN world speech bridge
    // ---------------------------------------------------------------
    document.addEventListener("__og_started", () => {
      console.log("[hotkey] MediaRecorder started in bridge");
    });

    document.addEventListener("__og_audio", ((e: CustomEvent) => {
      const dataUrl = e.detail as string;
      console.log("[hotkey] Audio received, size:", Math.round(dataUrl.length / 1024), "KB");
      setOverlayDone();

      // Save audio to storage (avoids message size limits), then notify background
      chrome.storage.local.set({ voiceAudioData: dataUrl }).then(() => {
        chrome.runtime.sendMessage({ type: "VOICE_AUDIO_READY" }).catch(() => {});
      });

      setTimeout(hideOverlay, 2000);
    }) as EventListener);

    document.addEventListener("__og_error", ((e: CustomEvent) => {
      console.error("[hotkey] Bridge error:", e.detail);
      isRecording = false;
      setOverlayError("Error: " + e.detail);
      chrome.action.setBadgeText?.({ text: "" });
    }) as EventListener);

    // ---------------------------------------------------------------
    // Voice Recording
    // ---------------------------------------------------------------
    function startRecording() {
      if (isRecording) return;
      isRecording = true;
      showOverlay();
      document.dispatchEvent(new CustomEvent("__og_start"));
      console.log("[hotkey] Recording start dispatched");
      chrome.runtime.sendMessage({ type: "VOICE_STARTED" }).catch(() => {});
    }

    function stopRecording() {
      if (!isRecording) return;
      isRecording = false;
      console.log("[hotkey] Stopping recording");
      document.dispatchEvent(new CustomEvent("__og_stop"));
      updateOverlay("Encoding audio...");
      // Audio will arrive via __og_audio event → saved to storage → VOICE_AUDIO_READY
    }

    // ---------------------------------------------------------------
    // Keyboard push-to-talk
    // ---------------------------------------------------------------
    document.addEventListener("keydown", (e) => {
      if (hotkey.code.startsWith("Mouse")) return;
      if (isHolding) return;
      if (matchesCombo(e.code, e.ctrlKey, e.altKey, e.shiftKey, e.metaKey)) {
        e.preventDefault();
        e.stopPropagation();
        isHolding = true;
        startRecording();
      }
    }, true);

    document.addEventListener("keyup", (e) => {
      if (hotkey.code.startsWith("Mouse")) return;
      if (!isHolding) return;
      if (e.code === hotkey.code) {
        isHolding = false;
        stopRecording();
      }
    }, true);

    // ---------------------------------------------------------------
    // Mouse push-to-talk
    // ---------------------------------------------------------------
    document.addEventListener("mousedown", (e) => {
      if (!hotkey.code.startsWith("Mouse")) return;
      if (isHolding) return;
      const mouseCode = "Mouse" + e.button;
      if (matchesCombo(mouseCode, e.ctrlKey, e.altKey, e.shiftKey, e.metaKey)) {
        e.preventDefault();
        e.stopPropagation();
        isHolding = true;
        startRecording();
      }
    }, true);

    document.addEventListener("mouseup", (e) => {
      if (!isHolding) return;
      if ("Mouse" + e.button === hotkey.code) {
        isHolding = false;
        stopRecording();
      }
    }, true);

    window.addEventListener("focus", () => { isHolding = false; });

    // ---------------------------------------------------------------
    // Commands from background (popup toggle / chrome.commands)
    // ---------------------------------------------------------------
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === "START_RECORDING") {
        startRecording();
        sendResponse({ ok: true });
      }
      if (msg.type === "STOP_RECORDING") {
        stopRecording();
        sendResponse({ ok: true });
      }
    });
  },
});

/**
 * Voice recording window (push-to-talk).
 * Auto-starts recording. Saves transcript to storage continuously.
 * Background reads storage when done.
 */

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

const indicator = document.getElementById("indicator")!;
const statusEl = document.getElementById("status")!;
const debugEl = document.getElementById("debug")!;
const transcriptEl = document.getElementById("transcript")!;

let resultCount = 0;
let errorCount = 0;

function updateDebug(lang: string, extra?: string) {
  debugEl.innerHTML = `lang=<span class="val">${lang}</span> results=<span class="val">${resultCount}</span> errors=<span class="val">${errorCount}</span>${extra ? " " + extra : ""}`;
}

async function main() {
  if (!SpeechRecognition) {
    indicator.className = "pulse error";
    statusEl.textContent = "Speech API not supported";
    debugEl.textContent = "SpeechRecognition API is undefined";
    return;
  }

  // Step 1: Request microphone permission explicitly
  statusEl.textContent = "Requesting mic...";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    console.log("[voice] Mic permission granted");
  } catch (err) {
    console.error("[voice] Mic denied:", err);
    indicator.className = "pulse error";
    statusEl.textContent = "Microphone access denied";
    debugEl.textContent = String(err);
    chrome.storage.local.set({ voiceTranscript: "" });
    return;
  }

  // Step 2: Start SpeechRecognition
  let finalTranscript = "";
  let interimTranscript = "";
  let isListening = false;

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  // Load user-selected language from settings, default to ru-RU
  const { voiceLang: savedLang } = await chrome.storage.local.get("voiceLang");
  const lang = (savedLang as string) || "ru-RU";
  recognition.lang = lang;

  updateDebug(lang);

  function getFullText(): string {
    return (finalTranscript + interimTranscript).trim();
  }

  function saveToStorage() {
    const text = getFullText();
    chrome.storage.local.set({ voiceTranscript: text });
  }

  recognition.onaudiostart = () => {
    console.log("[voice] Audio capture started");
    updateDebug(lang, '<span class="val">audio:ON</span>');
  };

  recognition.onsoundstart = () => {
    console.log("[voice] Sound detected");
  };

  recognition.onspeechstart = () => {
    console.log("[voice] Speech detected");
    updateDebug(lang, '<span class="val">speech:ON</span>');
  };

  recognition.onresult = (event: any) => {
    resultCount++;
    interimTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        finalTranscript += result[0].transcript + " ";
      } else {
        interimTranscript += result[0].transcript;
      }
    }
    const text = getFullText();
    if (text) {
      statusEl.textContent = text.length > 30 ? "..." + text.slice(-30) : text;
      transcriptEl.textContent = text;
    }
    updateDebug(lang);
    saveToStorage();
    console.log("[voice] onresult #" + resultCount + ":", text.slice(0, 60));
  };

  recognition.onerror = (event: any) => {
    errorCount++;
    console.error("[voice] Recognition error:", event.error, event.message);
    indicator.className = "pulse error";
    statusEl.textContent = "Error: " + event.error;
    updateDebug(lang, `<span class="val">err:${event.error}</span>`);
  };

  recognition.onnomatch = () => {
    console.log("[voice] No match");
    updateDebug(lang, '<span class="val">nomatch</span>');
  };

  recognition.onend = () => {
    console.log("[voice] Recognition ended, isListening:", isListening);
    if (isListening) {
      try { recognition.start(); } catch {}
    }
  };

  // Clear old transcript
  await chrome.storage.local.set({ voiceTranscript: "" });

  try {
    recognition.start();
    isListening = true;
    statusEl.textContent = "Listening...";
    console.log("[voice] Recording started, lang:", lang);
    updateDebug(lang, '<span class="val">started</span>');
  } catch (err) {
    console.error("[voice] Start failed:", err);
    indicator.className = "pulse error";
    statusEl.textContent = "Failed to start";
    debugEl.textContent = String(err);
    return;
  }

  // Step 3: Push-to-talk release detection
  const { customHotkey } = await chrome.storage.local.get("customHotkey");
  const hotkey = customHotkey || { code: "KeyV", ctrl: false, alt: true, shift: true, meta: false };
  console.log("[voice] Watching for hotkey release:", hotkey.code);

  let stopped = false;

  function stopAndSend() {
    if (stopped) return;
    stopped = true;
    console.log("[voice] Stopping recognition, sending VOICE_STOP");
    isListening = false;
    recognition.stop();
    indicator.className = "pulse done";
    statusEl.textContent = "Processing...";
    saveToStorage();
    setTimeout(() => {
      saveToStorage();
      chrome.runtime.sendMessage({ type: "VOICE_STOP" }).catch(() => {
        window.close();
      });
    }, 500);
  }

  if (!hotkey.code.startsWith("Mouse")) {
    document.addEventListener("keyup", (e) => {
      if (e.code === hotkey.code) {
        stopAndSend();
      }
    });
  }

  if (hotkey.code.startsWith("Mouse")) {
    const expectedButton = parseInt(hotkey.code.replace("Mouse", ""), 10);
    document.addEventListener("mouseup", (e) => {
      if (e.button === expectedButton) {
        stopAndSend();
      }
    });
  }

  // Escape to cancel
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      stopped = true;
      isListening = false;
      recognition.stop();
      chrome.storage.local.set({ voiceTranscript: "" });
      window.close();
    }
  });
}

main();

import { useState, useEffect, useRef, useCallback } from "react";

export interface HotkeyConfig {
  code: string;       // KeyboardEvent.code ("KeyV", "F2") or "Mouse3"/"Mouse4"/"Mouse5"
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

/** Human-readable label for a hotkey config */
function formatHotkey(hk: HotkeyConfig): string {
  const parts: string[] = [];
  if (hk.ctrl) parts.push("Ctrl");
  if (hk.alt) parts.push("Alt");
  if (hk.shift) parts.push("Shift");
  if (hk.meta) parts.push("Meta");

  // Friendly key name
  let key = hk.code;
  if (key.startsWith("Key")) key = key.slice(3);
  else if (key.startsWith("Digit")) key = key.slice(5);
  else if (key.startsWith("Mouse")) key = "Mouse " + key.slice(5);
  else if (key === "Space") key = "Space";
  else if (key.startsWith("Arrow")) key = key.slice(5) + " Arrow";

  parts.push(key);
  return parts.join(" + ");
}

const VOICE_LANGUAGES = [
  { code: "ru-RU", label: "RU" },
  { code: "en-US", label: "EN" },
  { code: "uk-UA", label: "UA" },
  { code: "de-DE", label: "DE" },
  { code: "fr-FR", label: "FR" },
  { code: "es-ES", label: "ES" },
  { code: "zh-CN", label: "ZH" },
  { code: "ja-JP", label: "JA" },
  { code: "ko-KR", label: "KO" },
  { code: "pt-BR", label: "PT" },
  { code: "it-IT", label: "IT" },
  { code: "tr-TR", label: "TR" },
  { code: "ar-SA", label: "AR" },
  { code: "hi-IN", label: "HI" },
  { code: "pl-PL", label: "PL" },
];

export default function HotkeyRecorder() {
  const [hotkey, setHotkey] = useState<HotkeyConfig>(DEFAULT_HOTKEY);
  const [recording, setRecording] = useState(false);
  const [voiceLang, setVoiceLang] = useState("ru-RU");
  const recorderRef = useRef<HTMLButtonElement>(null);

  // Load saved hotkey and language on mount
  useEffect(() => {
    chrome.storage.local.get(["customHotkey", "voiceLang"]).then(({ customHotkey, voiceLang: saved }) => {
      if (customHotkey) setHotkey(customHotkey as HotkeyConfig);
      if (saved) setVoiceLang(saved as string);
    });
  }, []);

  const saveHotkey = useCallback((hk: HotkeyConfig) => {
    setHotkey(hk);
    setRecording(false);
    chrome.storage.local.set({ customHotkey: hk });
  }, []);

  // Listen for key/mouse events while recording
  useEffect(() => {
    if (!recording) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Ignore standalone modifier keys — wait for the actual key
      if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;

      saveHotkey({
        code: e.code,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey,
      });
    };

    const onMouseDown = (e: MouseEvent) => {
      // Left click (0) and right click (2) are too common — only capture middle (1) and extra buttons (3, 4)
      if (e.button <= 0) {
        // Left click outside recorder — cancel recording
        if (recorderRef.current && !recorderRef.current.contains(e.target as Node)) {
          setRecording(false);
        }
        return;
      }
      if (e.button === 2) return; // skip right click

      e.preventDefault();
      e.stopPropagation();

      saveHotkey({
        code: "Mouse" + e.button,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey,
      });
    };

    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setRecording(false);
      }
    };

    // Capture phase to intercept before anything else
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keydown", onEscape, true);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("contextmenu", (e) => e.preventDefault(), true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keydown", onEscape, true);
      document.removeEventListener("mousedown", onMouseDown, true);
    };
  }, [recording, saveHotkey]);

  const resetToDefault = () => {
    saveHotkey(DEFAULT_HOTKEY);
  };

  const handleLangChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const lang = e.target.value;
    setVoiceLang(lang);
    chrome.storage.local.set({ voiceLang: lang });
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-gray-500 whitespace-nowrap">Hotkey:</span>
      <button
        ref={recorderRef}
        onClick={() => setRecording(true)}
        className={`px-2 py-1 rounded border text-xs font-mono cursor-pointer transition-colors ${
          recording
            ? "border-indigo-500 bg-indigo-50 text-indigo-700 animate-pulse"
            : "border-gray-300 bg-gray-50 text-gray-700 hover:border-indigo-400"
        }`}
        title={recording ? "Press any key/combo or mouse button..." : "Click to change hotkey"}
      >
        {recording ? "Press a key..." : formatHotkey(hotkey)}
      </button>
      {(hotkey.code !== DEFAULT_HOTKEY.code ||
        hotkey.ctrl !== DEFAULT_HOTKEY.ctrl ||
        hotkey.alt !== DEFAULT_HOTKEY.alt ||
        hotkey.shift !== DEFAULT_HOTKEY.shift) && (
        <button
          onClick={resetToDefault}
          className="text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer p-0 text-xs"
          title="Reset to default (Alt+Shift+V)"
        >
          reset
        </button>
      )}
      <select
        value={voiceLang}
        onChange={handleLangChange}
        className="px-1 py-0.5 rounded border border-gray-300 bg-gray-50 text-gray-700 text-xs cursor-pointer"
        title="Voice recognition language"
      >
        {VOICE_LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>{l.label}</option>
        ))}
      </select>
    </div>
  );
}

export { formatHotkey, DEFAULT_HOTKEY };
export type { HotkeyConfig as HotkeyConfigType };

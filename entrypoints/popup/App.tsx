import { useState, useEffect, useCallback, useMemo } from "react";
import type { Task, ItemType } from "@/lib/types";
import { searchTasks } from "@/lib/search";
import { updateTask, recordTagEdit } from "@/lib/storage";
import { createWorker } from "tesseract.js";
import KeySetup from "./components/KeySetup";
import TaskList from "./components/TaskList";
import HotkeyRecorder from "./components/HotkeyRecorder";

type ExtractResult = {
  success: boolean;
  tasks?: Task[];
  txHash?: string | null;
  error?: string;
};

type TabId = "do" | "schedule" | "saved";

const TAB_TYPES: Record<TabId, ItemType[]> = {
  do: ["task", "commitment", "reminder"],
  schedule: ["meeting"],
  saved: ["bookmark", "note", "credential", "contact", "idea", "resource"],
};

export default function App() {
  const [keyStored, setKeyStored] = useState(false);
  // Extraction state
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null);
  // Task list state
  const [tasks, setTasks] = useState<Task[]>([]);
  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>("do");
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  // Category filter
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  // Sound toggle
  const [soundEnabled, setSoundEnabled] = useState(true);
  // MemSync
  const [memsyncKey, setMemsyncKey] = useState("");
  const [memsyncStored, setMemsyncStored] = useState(false);

  // Tab counts (from all tasks, before search/category filter)
  const tabCounts = useMemo(() => ({
    do: tasks.filter((t) => TAB_TYPES.do.includes(t.type)).length,
    schedule: tasks.filter((t) => TAB_TYPES.schedule.includes(t.type)).length,
    saved: tasks.filter((t) => TAB_TYPES.saved.includes(t.type)).length,
  }), [tasks]);

  // Compute unique categories from tasks in active tab
  const categories = useMemo(() => {
    const tabTasks = tasks.filter((t) => TAB_TYPES[activeTab].includes(t.type));
    const cats = new Set<string>();
    for (const t of tabTasks) {
      if (t.category && t.category !== "general") cats.add(t.category);
      for (const tag of (t.tags ?? [])) cats.add(tag);
    }
    return [...cats].sort();
  }, [tasks, activeTab]);

  // Apply tab + search + category filter
  const filteredTasks = useMemo(() => {
    let result = tasks.filter((t) => TAB_TYPES[activeTab].includes(t.type));
    result = searchTasks(result, searchQuery);
    if (activeCategory) {
      result = result.filter((t) =>
        t.category === activeCategory || (t.tags ?? []).includes(activeCategory)
      );
    }
    return result;
  }, [tasks, activeTab, searchQuery, activeCategory]);

  // Send extracted content to background
  const sendToBackground = async (messagePayload: Record<string, unknown>) => {
    setExtracting(true);
    setExtractResult(null);
    try {
      const response = await browser.runtime.sendMessage(messagePayload);
      setExtractResult(response);
      if (response?.success && response.tasks) {
        setTasks((prev) => {
          const existingIds = new Set(prev.map((t) => t.id));
          const newOnes = (response.tasks as Task[]).filter(
            (t) => !existingIds.has(t.id),
          );
          return [...newOnes, ...prev];
        });
      }
    } catch (err) {
      setExtractResult({ success: false, error: String(err) });
    } finally {
      setExtracting(false);
    }
  };

  // Highlight a task by scrolling to it and applying a brief visual highlight
  const highlightTask = useCallback((taskId: string) => {
    const el = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("bg-amber-100");
    setTimeout(() => el.classList.remove("bg-amber-100"), 2000);
  }, []);

  // On mount: check existing keys, load tasks, check for highlight
  useEffect(() => {
    chrome.storage.local.get("ogPrivateKey").then(({ ogPrivateKey }) => {
      if (ogPrivateKey) setKeyStored(true);
    });

    chrome.storage.local.get("soundEnabled").then(({ soundEnabled }) => {
      setSoundEnabled(soundEnabled !== false);
    });

    chrome.storage.local.get("memsyncApiKey").then(({ memsyncApiKey }) => {
      if (memsyncApiKey) setMemsyncStored(true);
    });

    browser.runtime
      .sendMessage({ type: "GET_TASKS" })
      .then((response) => {
        if (response?.success && response.tasks) {
          setTasks(response.tasks);
        }
      })
      .catch((err) => console.warn("[popup] Failed to load tasks:", err));

    // Check for highlightTaskId (set by notification click)
    chrome.storage.local.get("highlightTaskId").then(({ highlightTaskId }) => {
      if (highlightTaskId) {
        // Delay slightly to let tasks render
        setTimeout(() => highlightTask(highlightTaskId as string), 300);
        chrome.storage.local.remove("highlightTaskId");
      }
    });
  }, [highlightTask]);

  // Listen for highlightTaskId changes in storage (notification click while popup open)
  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== "local") return;
      if (changes.highlightTaskId?.newValue) {
        const taskId = changes.highlightTaskId.newValue as string;
        setTimeout(() => highlightTask(taskId), 300);
        chrome.storage.local.remove("highlightTaskId");
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [highlightTask]);

  // Convert blob to base64 data URL
  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  // OCR: extract text from image using Tesseract.js (local files, no CDN)
  const ocrImage = async (base64: string): Promise<string> => {
    console.log("[popup] Starting OCR...");

    const workerPath = chrome.runtime.getURL("/tesseract/worker.min.js");
    const corePath = chrome.runtime.getURL("/tesseract/tesseract-core-simd-lstm.wasm.js");
    const langPath = chrome.runtime.getURL("/tesseract/");

    const worker = await createWorker("rus+eng", 1, {
      workerPath,
      corePath,
      langPath,
      workerBlobURL: false,
      gzip: false,
      logger: (m: { status: string; progress: number }) => {
        console.log("[OCR]", m.status, Math.round(m.progress * 100) + "%");
      },
    });
    console.log("[popup] OCR worker ready, recognizing...");
    const { data } = await worker.recognize(base64);
    await worker.terminate();
    console.log("[popup] OCR result:", data.text.slice(0, 100));
    return data.text;
  };

  // Process image: OCR → extract text → send to background
  const processImage = async (base64: string) => {
    try {
      setExtracting(true);
      setExtractResult(null);
      const text = await ocrImage(base64);
      if (!text.trim()) {
        setExtractResult({ success: false, error: "OCR could not read text from the screenshot. Try copying text directly." });
        setExtracting(false);
        return;
      }
      // Now send OCR text through normal text extraction pipeline
      setExtracting(false);
      sendToBackground({ type: "EXTRACT_FROM_CLIPBOARD", inputType: "text", text });
    } catch (err) {
      setExtractResult({ success: false, error: `OCR failed: ${err instanceof Error ? err.message : String(err)}` });
      setExtracting(false);
    }
  };

  // Paste listener for screenshots (Ctrl+V) — OCR then extract via x402
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (extracting || !keyStored) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (!blob) continue;
          const base64 = await blobToBase64(blob);
          processImage(base64);
          return;
        }
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [extracting, keyStored]);

  // Button click: try image from clipboard first, fall back to text
  const extractFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const base64 = await blobToBase64(blob);
          processImage(base64);
          return;
        }
      }
    } catch {
      // clipboard.read() not available -- fall through to readText
    }

    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setExtractResult({
          success: false,
          error: "Clipboard is empty. For screenshots use Ctrl+V in the popup.",
        });
        return;
      }
      sendToBackground({
        type: "EXTRACT_FROM_CLIPBOARD",
        inputType: "text",
        text,
      });
    } catch {
      setExtractResult({
        success: false,
        error: "Cannot read clipboard. Check extension permissions.",
      });
    }
  };

  // Optimistic UI: toggle task completion
  const handleComplete = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              completed: !t.completed,
              completedAt: !t.completed ? new Date().toISOString() : null,
            }
          : t,
      ),
    );
    browser.runtime.sendMessage({ type: "COMPLETE_TASK", taskId }).catch(console.error);
  };

  // Delete task with confirmation from background
  const handleDelete = async (taskId: string) => {
    const removed = tasks.find((t) => t.id === taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    try {
      const response = await browser.runtime.sendMessage({ type: "DELETE_TASK", taskId });
      console.log("[popup] DELETE_TASK response:", response);
      if (!response?.success) {
        console.error("[popup] DELETE_TASK failed:", response?.error);
        if (removed) setTasks((prev) => [...prev, removed]);
      }
    } catch (err) {
      console.error("[popup] DELETE_TASK sendMessage error:", err);
      if (removed) setTasks((prev) => [...prev, removed]);
    }
  };

  // Set reminder: update UI + storage + create alarm via background
  const handleSetReminder = (taskId: string, reminderAt: string, reminderNote: string | null) => {
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, reminderAt, reminderNote } : t));
    browser.runtime.sendMessage({ type: "SET_REMINDER", taskId, reminderAt, reminderNote }).catch(console.error);
  };

  // Clear reminder
  const handleClearReminder = (taskId: string) => {
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, reminderAt: null, reminderNote: null } : t));
    browser.runtime.sendMessage({ type: "CLEAR_REMINDER", taskId }).catch(console.error);
  };

  // Update tags on a task + record pattern for AI learning
  const handleUpdateTags = (taskId: string, tags: string[]) => {
    const task = tasks.find((t) => t.id === taskId);
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, tags } : t));
    updateTask(taskId, { tags });
    if (task) recordTagEdit(task, tags);
  };

  const truncateHash = (hash: string) =>
    hash.length > 14 ? `${hash.slice(0, 6)}...${hash.slice(-4)}` : hash;

  const toggleSound = () => {
    const newValue = !soundEnabled;
    setSoundEnabled(newValue);
    chrome.storage.local.set({ soundEnabled: newValue });
  };

  return (
    <div className="w-[380px] p-4 font-sans">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="m-0 text-lg font-semibold">OpenGradient Task Assistant</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSound}
            className="text-gray-400 hover:text-indigo-500 cursor-pointer bg-transparent border-none p-0 leading-none"
            title={soundEnabled ? "Sound on — click to mute" : "Sound off — click to unmute"}
          >
            {soundEnabled ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M11 5L6 9H2v6h4l5 4V5z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707A1 1 0 0112 5v14a1 1 0 01-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            )}
          </button>
          <span className="text-xs text-gray-400">v0.7.0</span>
        </div>
      </div>

      {/* Wallet Key */}
      <KeySetup keyStored={keyStored} onKeyStored={() => setKeyStored(true)} />

      {/* MemSync */}
      {keyStored && (
        <div className="mb-3 p-2.5 bg-gray-50 rounded-md border border-gray-200">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-xs font-semibold text-gray-700">MemSync</div>
            {memsyncStored && (
              <div className="flex items-center gap-1 text-[11px] text-green-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-600 inline-block" />
                Connected
              </div>
            )}
          </div>
          {!memsyncStored ? (
            <div>
              <input
                type="password"
                value={memsyncKey}
                onChange={(e) => setMemsyncKey(e.target.value)}
                placeholder="MemSync API key (app.memsync.ai)"
                className="w-full p-1.5 mb-1.5 border border-gray-300 rounded text-xs box-border"
              />
              <button
                onClick={async () => {
                  if (!memsyncKey.trim()) return;
                  const resp = await browser.runtime.sendMessage({ type: "SAVE_MEMSYNC_KEY", key: memsyncKey });
                  if (resp?.success) { setMemsyncStored(true); setMemsyncKey(""); }
                }}
                className="w-full py-1 px-2 bg-indigo-600 text-white border-none rounded cursor-pointer text-xs font-medium hover:bg-indigo-700"
              >
                Save Key
              </button>
              <p className="mt-1 text-[10px] text-gray-400">
                Optional. Tasks auto-sync to MemSync for cross-device AI memory.
              </p>
            </div>
          ) : (
            <button
              onClick={async () => {
                await browser.runtime.sendMessage({ type: "SAVE_MEMSYNC_KEY", key: "" });
                setMemsyncStored(false);
              }}
              className="text-[11px] text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-0"
            >
              Disconnect
            </button>
          )}
        </div>
      )}

      {/* Extraction Section */}
      {keyStored && (
        <div className="mb-3">
          <div className="mb-2">
            <button
              onClick={extractFromClipboard}
              disabled={extracting}
              className={`w-full py-2.5 px-3 text-white border-none rounded cursor-pointer text-sm font-semibold ${
                extracting
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {extracting ? "Processing..." : "Extract from Clipboard"}
            </button>
            <button
              onClick={async () => {
                try {
                  const resp = await browser.runtime.sendMessage({ type: "TOGGLE_VOICE" });
                  console.log("[popup] TOGGLE_VOICE:", resp);
                } catch (err) {
                  console.error("[popup] TOGGLE_VOICE failed:", err);
                }
              }}
              className="w-full mt-1.5 py-2 px-3 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded cursor-pointer text-sm font-semibold flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-14 0m7 7v4m-4 0h8M12 1a3 3 0 00-3 3v7a3 3 0 006 0V4a3 3 0 00-3-3z" />
              </svg>
              Voice Input
            </button>
            <div className="text-[11px] text-gray-400 mt-1.5 text-center">
              Text: click button | Screenshot: Ctrl+V
            </div>
            <div className="mt-2 flex justify-center">
              <HotkeyRecorder />
            </div>
            <button
              onClick={() => chrome.tabs.create({ url: "chrome://extensions/shortcuts" })}
              className="w-full mt-1.5 text-[11px] text-gray-400 hover:text-indigo-500 bg-transparent border-none cursor-pointer underline"
            >
              Enable global hotkey (works with minimized browser)
            </button>
          </div>
        </div>
      )}

      {/* Result Banner */}
      {extractResult && (
        <div
          className={`mb-3 p-2.5 rounded-md border ${
            extractResult.success
              ? "bg-green-100 border-green-300"
              : "bg-red-100 border-red-300"
          }`}
        >
          <strong className="text-sm">
            {extractResult.success ? "SUCCESS" : "FAILED"}
          </strong>
          <p className="mt-1 mb-0 text-xs">
            {extractResult.success
              ? `Found ${extractResult.tasks?.length ?? 0} task(s)`
              : extractResult.error}
          </p>
          {extractResult.success && extractResult.txHash && (
            <p className="mt-0.5 mb-0 text-[11px] text-gray-500">
              TX: {truncateHash(extractResult.txHash)}
            </p>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-2">
        {([
          { id: "do" as TabId, label: "Do", count: tabCounts.do },
          { id: "schedule" as TabId, label: "Schedule", count: tabCounts.schedule },
          { id: "saved" as TabId, label: "Saved", count: tabCounts.saved },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setActiveCategory(null); }}
            className={`flex-1 py-1.5 text-xs font-semibold border-b-2 cursor-pointer bg-transparent transition-colors ${
              activeTab === tab.id
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {tab.label} {tab.count > 0 && <span className="ml-0.5 text-[10px] opacity-70">({tab.count})</span>}
          </button>
        ))}
      </div>

      {/* Task List */}
      <TaskList
        tasks={filteredTasks}
        searchQuery={searchQuery}
        onSearch={setSearchQuery}
        categories={categories}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        activeTab={activeTab}
        onComplete={handleComplete}
        onDelete={handleDelete}
        onSetReminder={handleSetReminder}
        onClearReminder={handleClearReminder}
        onUpdateTags={handleUpdateTags}
      />

      {/* Export */}
      {tasks.length > 0 && (
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = Object.assign(document.createElement("a"), { href: url, download: "tasks.json" });
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex-1 py-1 text-[11px] text-gray-500 hover:text-indigo-600 bg-transparent border border-gray-200 rounded cursor-pointer"
          >
            Export JSON
          </button>
          <button
            onClick={() => {
              const header = "id,type,action,deadline,priority,category,tags,completed,createdAt,reminderAt\n";
              const rows = tasks.map((t) => [
                t.id, t.type,
                `"${(t.action || "").replace(/"/g, '""')}"`,
                t.deadline ?? "", t.priority, t.category ?? "",
                `"${(t.tags ?? []).join(";")}"`,
                t.completed, t.createdAt, t.reminderAt ?? "",
              ].join(",")).join("\n");
              const blob = new Blob([header + rows], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = Object.assign(document.createElement("a"), { href: url, download: "tasks.csv" });
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex-1 py-1 text-[11px] text-gray-500 hover:text-indigo-600 bg-transparent border border-gray-200 rounded cursor-pointer"
          >
            Export CSV
          </button>
        </div>
      )}

      {/* Footer */}
      <p className="mt-3 text-[11px] text-gray-400 text-center">
        v0.7.0 -- Export + MemSync
      </p>
    </div>
  );
}

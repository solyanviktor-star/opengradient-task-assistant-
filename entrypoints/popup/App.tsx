import { useState, useEffect, useCallback, useMemo } from "react";
import type { Task } from "@/lib/types";
import { searchTasks } from "@/lib/search";
import KeySetup from "./components/KeySetup";
import TaskList from "./components/TaskList";

const OCR_ENDPOINT = "http://localhost:8402/ocr";

type ExtractResult = {
  success: boolean;
  tasks?: Task[];
  txHash?: string | null;
  error?: string;
};

export default function App() {
  const [keyStored, setKeyStored] = useState(false);
  // Extraction state
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null);
  // Task list state
  const [tasks, setTasks] = useState<Task[]>([]);
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const filteredTasks = useMemo(() => searchTasks(tasks, searchQuery), [tasks, searchQuery]);

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

  // OCR via proxy: send image base64, get text back
  const ocrImage = async (blob: Blob): Promise<string | null> => {
    const base64: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const resp = await fetch(OCR_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: base64 }),
    });
    const data = await resp.json();
    return data.text?.trim() || null;
  };

  // Paste listener for screenshots (Ctrl+V)
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
          setExtracting(true);
          setExtractResult(null);
          try {
            const ocrText = await ocrImage(blob);
            if (!ocrText) {
              setExtractResult({ success: false, error: "OCR found no text in screenshot." });
              setExtracting(false);
              return;
            }
            sendToBackground({ type: "EXTRACT_FROM_CLIPBOARD", inputType: "text", text: ocrText });
          } catch {
            setExtractResult({ success: false, error: "OCR failed. Is proxy running?" });
            setExtracting(false);
          }
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
          setExtracting(true);
          setExtractResult(null);
          try {
            const ocrText = await ocrImage(blob);
            if (!ocrText) {
              setExtractResult({ success: false, error: "OCR found no text in screenshot." });
              setExtracting(false);
              return;
            }
            sendToBackground({ type: "EXTRACT_FROM_CLIPBOARD", inputType: "text", text: ocrText });
          } catch {
            setExtractResult({ success: false, error: "OCR failed. Is proxy running?" });
            setExtracting(false);
          }
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

  // Optimistic UI: set reminder
  const handleSetReminder = (taskId: string, reminderAt: string) => {
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, reminderAt } : t));
    browser.runtime.sendMessage({ type: "SET_REMINDER", taskId, reminderAt }).catch(console.error);
  };

  // Optimistic UI: clear reminder
  const handleClearReminder = (taskId: string) => {
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, reminderAt: null } : t));
    browser.runtime.sendMessage({ type: "CLEAR_REMINDER", taskId }).catch(console.error);
  };

  const truncateHash = (hash: string) =>
    hash.length > 14 ? `${hash.slice(0, 6)}...${hash.slice(-4)}` : hash;

  return (
    <div className="w-[380px] p-4 font-sans">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="m-0 text-lg font-semibold">OpenGradient Task Assistant</h2>
        <span className="text-xs text-gray-400">v0.5.0</span>
      </div>

      {/* Wallet Key */}
      <KeySetup keyStored={keyStored} onKeyStored={() => setKeyStored(true)} />

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
            <div className="text-[11px] text-gray-400 mt-1.5 text-center">
              Text: click button | Screenshot: Ctrl+V
            </div>
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

      {/* Task List */}
      <TaskList
        tasks={filteredTasks}
        searchQuery={searchQuery}
        onSearch={setSearchQuery}
        onComplete={handleComplete}
        onDelete={handleDelete}
        onSetReminder={handleSetReminder}
        onClearReminder={handleClearReminder}
      />

      {/* Footer */}
      <p className="mt-3 text-[11px] text-gray-400 text-center">
        v0.5.0 -- Reminders + Search
      </p>
    </div>
  );
}

import { useState, useEffect } from "react";
import type { Task } from "@/lib/types";

type ExtractResult = {
  success: boolean;
  tasks?: Task[];
  txHash?: string | null;
  error?: string;
};

export default function App() {
  // Key management state
  const [privateKey, setPrivateKey] = useState("");
  const [keyStored, setKeyStored] = useState(false);
  const [memsyncKey, setMemsyncKey] = useState("");
  const [memsyncKeyStored, setMemsyncKeyStored] = useState(false);

  // Extraction state
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null);

  // Task list state
  const [tasks, setTasks] = useState<Task[]>([]);

  // On mount: check existing keys and load tasks
  useEffect(() => {
    // Check wallet key
    chrome.storage.session.get("ogPrivateKey").then(({ ogPrivateKey }) => {
      if (ogPrivateKey) setKeyStored(true);
    });

    // Check MemSync key
    chrome.storage.local.get("memsyncApiKey").then(({ memsyncApiKey }) => {
      if (memsyncApiKey) setMemsyncKeyStored(true);
    });

    // Load existing tasks
    browser.runtime
      .sendMessage({ type: "GET_TASKS" })
      .then((response) => {
        if (response?.success && response.tasks) {
          setTasks(response.tasks);
        }
      })
      .catch((err) => console.warn("[popup] Failed to load tasks:", err));
  }, []);

  const saveKey = async () => {
    if (!privateKey.startsWith("0x") || privateKey.length !== 66) {
      setExtractResult({
        success: false,
        error: "Invalid private key format (must be 0x + 64 hex chars)",
      });
      return;
    }
    const response = await browser.runtime.sendMessage({
      type: "SAVE_PRIVATE_KEY",
      key: privateKey,
    });
    if (response.success) {
      setKeyStored(true);
      setPrivateKey("");
      setExtractResult(null);
    } else {
      setExtractResult({ success: false, error: response.error });
    }
  };

  const saveMemsyncKey = async () => {
    if (!memsyncKey.trim()) {
      setExtractResult({ success: false, error: "MemSync API key cannot be empty" });
      return;
    }
    const response = await browser.runtime.sendMessage({
      type: "SAVE_MEMSYNC_KEY",
      key: memsyncKey.trim(),
    });
    if (response.success) {
      setMemsyncKeyStored(true);
      setMemsyncKey("");
      setExtractResult(null);
    } else {
      setExtractResult({ success: false, error: response.error });
    }
  };

  const triggerExtraction = async (platform: "telegram" | "selection") => {
    setExtracting(true);
    setExtractResult(null);
    try {
      const response = await browser.runtime.sendMessage({
        type: "TRIGGER_EXTRACTION",
        platform,
      });
      setExtractResult(response);
      if (response?.success && response.tasks) {
        // Prepend new tasks to the list
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

  const truncateHash = (hash: string) =>
    hash.length > 14 ? `${hash.slice(0, 6)}...${hash.slice(-4)}` : hash;

  const priorityColors: Record<string, string> = {
    high: "#dc2626",
    medium: "#d97706",
    low: "#16a34a",
  };

  const typeLabels: Record<string, string> = {
    call: "Call",
    meeting: "Meeting",
    task: "Task",
    note: "Note",
    reminder: "Reminder",
  };

  return (
    <div style={{ width: 380, padding: 16, fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>OpenGradient Task Assistant</h2>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>v0.2.0</span>
      </div>

      {/* Wallet Key Section */}
      <div
        style={{
          marginBottom: 12,
          padding: 10,
          backgroundColor: "#f9fafb",
          borderRadius: 6,
          border: "1px solid #e5e7eb",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#374151",
            marginBottom: 6,
          }}
        >
          Wallet Key
        </div>
        {!keyStored ? (
          <div>
            <input
              type="password"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder="0x..."
              style={{
                width: "100%",
                padding: 6,
                marginBottom: 6,
                border: "1px solid #d1d5db",
                borderRadius: 4,
                fontSize: 13,
                boxSizing: "border-box",
              }}
            />
            <button
              onClick={saveKey}
              style={{
                width: "100%",
                padding: "6px 12px",
                backgroundColor: "#4f46e5",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              Save Key (session only)
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              color: "#16a34a",
              fontWeight: 500,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: "#16a34a",
                display: "inline-block",
              }}
            />
            Configured (session storage)
          </div>
        )}
      </div>

      {/* MemSync Key Section */}
      <div
        style={{
          marginBottom: 12,
          padding: 10,
          backgroundColor: "#f9fafb",
          borderRadius: 6,
          border: "1px solid #e5e7eb",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#374151",
            marginBottom: 6,
          }}
        >
          MemSync API Key{" "}
          <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span>
        </div>
        {!memsyncKeyStored ? (
          <div>
            <input
              type="password"
              value={memsyncKey}
              onChange={(e) => setMemsyncKey(e.target.value)}
              placeholder="ms-..."
              style={{
                width: "100%",
                padding: 6,
                marginBottom: 6,
                border: "1px solid #d1d5db",
                borderRadius: 4,
                fontSize: 13,
                boxSizing: "border-box",
              }}
            />
            <button
              onClick={saveMemsyncKey}
              style={{
                width: "100%",
                padding: "6px 12px",
                backgroundColor: "#6366f1",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              Save MemSync Key
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              color: "#16a34a",
              fontWeight: 500,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: "#16a34a",
                display: "inline-block",
              }}
            />
            Configured (persistent)
          </div>
        )}
      </div>

      {/* Extraction Section (only when wallet key is configured) */}
      {keyStored && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <button
              onClick={() => triggerExtraction("telegram")}
              disabled={extracting}
              style={{
                flex: 1,
                padding: "8px 10px",
                backgroundColor: extracting ? "#9ca3af" : "#4f46e5",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: extracting ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              Extract from Telegram
            </button>
            <button
              onClick={() => triggerExtraction("selection")}
              disabled={extracting}
              style={{
                flex: 1,
                padding: "8px 10px",
                backgroundColor: extracting ? "#9ca3af" : "#2563eb",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: extracting ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              Extract Selected Text
            </button>
          </div>
          {extracting && (
            <div
              style={{
                textAlign: "center",
                fontSize: 13,
                color: "#6366f1",
                padding: 8,
              }}
            >
              Extracting tasks...
            </div>
          )}
        </div>
      )}

      {/* Result Banner */}
      {extractResult && (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            backgroundColor: extractResult.success ? "#dcfce7" : "#fee2e2",
            borderRadius: 6,
            border: `1px solid ${extractResult.success ? "#86efac" : "#fca5a5"}`,
          }}
        >
          <strong style={{ fontSize: 13 }}>
            {extractResult.success ? "SUCCESS" : "FAILED"}
          </strong>
          <p style={{ margin: "4px 0 0", fontSize: 12 }}>
            {extractResult.success
              ? `Found ${extractResult.tasks?.length ?? 0} task(s)`
              : extractResult.error}
          </p>
          {extractResult.success && extractResult.txHash && (
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#666" }}>
              TX: {truncateHash(extractResult.txHash)}
            </p>
          )}
        </div>
      )}

      {/* Task List */}
      <div
        style={{
          maxHeight: 300,
          overflowY: "auto",
          borderRadius: 6,
          border: tasks.length > 0 ? "1px solid #e5e7eb" : "none",
        }}
      >
        {tasks.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              fontSize: 13,
              color: "#9ca3af",
              padding: 16,
            }}
          >
            No tasks yet. Extract some from a page!
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              style={{
                padding: "8px 10px",
                borderBottom: "1px solid #f3f4f6",
                fontSize: 13,
              }}
            >
              {/* Task header row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 2,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "1px 5px",
                      backgroundColor: "#e0e7ff",
                      color: "#4338ca",
                      borderRadius: 3,
                      fontWeight: 600,
                    }}
                  >
                    {typeLabels[task.type] ?? task.type}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "1px 5px",
                      backgroundColor: `${priorityColors[task.priority] ?? "#d97706"}20`,
                      color: priorityColors[task.priority] ?? "#d97706",
                      borderRadius: 3,
                      fontWeight: 600,
                    }}
                  >
                    {task.priority}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {/* Synced indicator dot */}
                  <span
                    title={task.synced ? "Synced to MemSync" : "Not synced"}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      backgroundColor: task.synced ? "#16a34a" : "#eab308",
                      display: "inline-block",
                    }}
                  />
                  {task.txHash && (
                    <a
                      href={`https://explorer.opengradient.ai/tx/${task.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 10,
                        color: "#6366f1",
                        textDecoration: "none",
                      }}
                      title={task.txHash}
                    >
                      tx
                    </a>
                  )}
                </div>
              </div>

              {/* Action text */}
              <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{task.action}</div>

              {/* Deadline + source */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: "#6b7280",
                  marginTop: 2,
                }}
              >
                <span>
                  {task.deadline
                    ? `Due: ${new Date(task.deadline).toLocaleDateString()}`
                    : "No deadline"}
                </span>
                <a
                  href={task.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "#6b7280",
                    textDecoration: "none",
                    maxWidth: 140,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    display: "inline-block",
                  }}
                  title={task.sourceUrl}
                >
                  {task.sourceUrl.replace(/^https?:\/\//, "").slice(0, 30)}
                </a>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <p
        style={{
          marginTop: 12,
          fontSize: 11,
          color: "#aaa",
          textAlign: "center",
        }}
      >
        v0.2.0 -- Extraction Pipeline
      </p>
    </div>
  );
}

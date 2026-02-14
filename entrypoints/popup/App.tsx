import { useState, useEffect } from "react";

type TestResult = {
  success: boolean;
  content?: string;
  model?: string;
  error?: string;
};

export default function App() {
  const [privateKey, setPrivateKey] = useState("");
  const [keyStored, setKeyStored] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  useEffect(() => {
    // Check if key already stored in session
    chrome.storage.session.get("ogPrivateKey").then(({ ogPrivateKey }) => {
      if (ogPrivateKey) setKeyStored(true);
    });
  }, []);

  const saveKey = async () => {
    if (!privateKey.startsWith("0x") || privateKey.length !== 66) {
      setResult({
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
      setPrivateKey(""); // Clear from UI immediately
      setResult(null);
    } else {
      setResult({ success: false, error: response.error });
    }
  };

  const testX402 = async () => {
    setTesting(true);
    setResult(null);
    try {
      const response = await browser.runtime.sendMessage({ type: "TEST_X402" });
      setResult(response);
    } catch (err) {
      setResult({ success: false, error: String(err) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ width: 380, padding: 16, fontFamily: "system-ui" }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>
        OpenGradient Task Assistant
      </h2>

      {!keyStored ? (
        <div>
          <p style={{ margin: "0 0 8px", fontSize: 14, color: "#444" }}>
            Enter your OpenGradient wallet private key:
          </p>
          <input
            type="password"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            placeholder="0x..."
            style={{
              width: "100%",
              padding: 8,
              marginBottom: 8,
              border: "1px solid #ccc",
              borderRadius: 4,
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
          <button
            onClick={saveKey}
            style={{
              width: "100%",
              padding: "8px 16px",
              backgroundColor: "#4f46e5",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Save Key (session only)
          </button>
          <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
            Key is stored in memory only. It will be cleared when you close the
            browser.
          </p>
        </div>
      ) : (
        <div>
          <p
            style={{
              margin: "0 0 12px",
              fontSize: 14,
              color: "#16a34a",
              fontWeight: 500,
            }}
          >
            Wallet key configured (session storage)
          </p>
          <button
            onClick={testX402}
            disabled={testing}
            style={{
              width: "100%",
              padding: "8px 16px",
              backgroundColor: testing ? "#9ca3af" : "#4f46e5",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: testing ? "not-allowed" : "pointer",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {testing ? "Testing..." : "Test x402 Gateway"}
          </button>
        </div>
      )}

      {result && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            backgroundColor: result.success ? "#dcfce7" : "#fee2e2",
            borderRadius: 4,
            border: `1px solid ${result.success ? "#86efac" : "#fca5a5"}`,
          }}
        >
          <strong style={{ fontSize: 14 }}>
            {result.success ? "SUCCESS" : "FAILED"}
          </strong>
          <p style={{ margin: "8px 0 0", fontSize: 13 }}>
            {result.success ? result.content : result.error}
          </p>
          {result.model && (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#666" }}>
              Model: {result.model}
            </p>
          )}
        </div>
      )}

      <p
        style={{
          marginTop: 16,
          fontSize: 11,
          color: "#aaa",
          textAlign: "center",
        }}
      >
        v0.1.0 — x402 Spike
      </p>
    </div>
  );
}

import { useState } from "react";

interface KeySetupProps {
  keyStored: boolean;
  onKeyStored: () => void;
}

export default function KeySetup({ keyStored, onKeyStored }: KeySetupProps) {
  const [privateKey, setPrivateKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const saveKey = async () => {
    if (!privateKey.startsWith("0x") || privateKey.length !== 66) {
      setError("Invalid private key format (must be 0x + 64 hex chars)");
      return;
    }
    try {
      const response = await browser.runtime.sendMessage({
        type: "SAVE_PRIVATE_KEY",
        key: privateKey,
      });
      if (response.success) {
        onKeyStored();
        setPrivateKey("");
        setError(null);
      } else {
        setError(response.error ?? "Failed to save key");
      }
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <div className="mb-3 p-2.5 bg-gray-50 rounded-md border border-gray-200">
      <div className="text-xs font-semibold text-gray-700 mb-1.5">
        Wallet Key
      </div>
      {!keyStored ? (
        <div>
          <input
            type="password"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            placeholder="0x..."
            className="w-full p-1.5 mb-1.5 border border-gray-300 rounded text-sm box-border"
          />
          <button
            onClick={saveKey}
            className="w-full py-1.5 px-3 bg-indigo-600 text-white border-none rounded cursor-pointer text-sm font-medium hover:bg-indigo-700"
          >
            Save Key
          </button>
          {error && (
            <p className="mt-1 text-xs text-red-500">{error}</p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
          <span className="w-2 h-2 rounded-full bg-green-600 inline-block" />
          Configured
        </div>
      )}
    </div>
  );
}

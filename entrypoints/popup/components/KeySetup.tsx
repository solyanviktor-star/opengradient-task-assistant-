import { useState, useEffect } from "react";

interface KeySetupProps {
  keyStored: boolean;
  onKeyStored: () => void;
}

const OPG_TOKEN = "0x240b09731D96979f50B2C649C9CE10FcF9C7987F";
const BALANCE_OF_SELECTOR = "0x70a08231";
const COST_PER_REQUEST = 0.05;

async function getOPGBalance(walletAddress: string): Promise<number> {
  const paddedAddr = walletAddress.slice(2).padStart(64, "0");
  const resp = await fetch("https://sepolia.base.org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to: OPG_TOKEN, data: BALANCE_OF_SELECTOR + paddedAddr }, "latest"],
      id: 1,
    }),
  });
  const data = await resp.json();
  return Number(BigInt(data.result)) / 1e18;
}

async function getWalletAddress(): Promise<string | null> {
  try {
    const { privateKeyToAccount } = await import("viem/accounts");
    const { ogPrivateKey } = await chrome.storage.local.get("ogPrivateKey");
    if (!ogPrivateKey) return null;
    const account = privateKeyToAccount(ogPrivateKey as `0x${string}`);
    return account.address;
  } catch {
    return null;
  }
}

async function claimFaucet(address: string): Promise<{ ok: boolean; msg: string }> {
  try {
    const resp = await fetch("https://faucet.opengradient.ai/api/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    const data = await resp.json();
    if (resp.ok && !data.msg?.includes("exceeded")) {
      return { ok: true, msg: "OPG tokens requested! Balance will update in ~30s." };
    }
    return { ok: false, msg: data.msg || "Faucet error" };
  } catch (err) {
    return { ok: false, msg: String(err) };
  }
}

export default function KeySetup({ keyStored, onKeyStored }: KeySetupProps) {
  const [privateKey, setPrivateKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [walletAddr, setWalletAddr] = useState<string | null>(null);
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!keyStored) return;
    getWalletAddress().then((addr) => {
      if (!addr) return;
      setWalletAddr(addr);
      getOPGBalance(addr).then(setBalance);
    });
  }, [keyStored]);

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

  const handleClaim = async () => {
    if (!walletAddr) return;
    setClaiming(true);
    setFaucetMsg(null);
    const result = await claimFaucet(walletAddr);
    setFaucetMsg(result.msg);
    setClaiming(false);
    if (result.ok) {
      setTimeout(() => {
        getOPGBalance(walletAddr).then(setBalance);
        setFaucetMsg(null);
      }, 30000);
    }
  };

  const requestsLeft = balance !== null ? Math.floor(balance / COST_PER_REQUEST) : null;
  const isLow = requestsLeft !== null && requestsLeft <= 2;

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
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
              <span className="w-2 h-2 rounded-full bg-green-600 inline-block" />
              Configured
            </div>
            {balance !== null && (
              <div className={`text-xs font-medium ${isLow ? "text-red-500" : "text-gray-500"}`}>
                {balance.toFixed(3)} OPG
                {requestsLeft !== null && (
                  <span className="ml-1 text-[10px] opacity-70">
                    (~{requestsLeft} req{requestsLeft !== 1 ? "s" : ""})
                  </span>
                )}
              </div>
            )}
          </div>
          {isLow && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="text-[11px] text-red-500">Low balance!</span>
              <button
                onClick={handleClaim}
                disabled={claiming}
                className="text-[11px] px-2 py-0.5 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded border-none cursor-pointer font-medium disabled:opacity-50"
              >
                {claiming ? "Claiming..." : "Get OPG"}
              </button>
            </div>
          )}
          {faucetMsg && (
            <p className="mt-1 text-[11px] text-gray-500">{faucetMsg}</p>
          )}
        </div>
      )}
    </div>
  );
}

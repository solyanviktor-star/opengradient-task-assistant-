import { useState } from 'react';

export default function App() {
  const [status, setStatus] = useState<string>('Ready');
  const [pingResult, setPingResult] = useState<string | null>(null);

  const handlePing = async () => {
    setStatus('Pinging...');
    setPingResult(null);
    try {
      const response = await browser.runtime.sendMessage({ type: 'PING' });
      setStatus('Ready');
      setPingResult(
        `Status: ${response.status}, Timestamp: ${new Date(response.timestamp).toLocaleTimeString()}`
      );
    } catch (err) {
      setStatus('Error');
      setPingResult(String(err));
    }
  };

  return (
    <div className="w-[380px] p-4 font-sans bg-white text-gray-900">
      <h1 className="text-lg font-bold mb-2">OpenGradient Task Assistant</h1>

      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-gray-500">Status:</span>
        <span
          className={`text-sm font-medium ${
            status === 'Ready'
              ? 'text-green-600'
              : status === 'Error'
                ? 'text-red-600'
                : 'text-yellow-600'
          }`}
        >
          {status}
        </span>
      </div>

      <button
        onClick={handlePing}
        className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors cursor-pointer text-sm font-medium"
      >
        Ping Service Worker
      </button>

      {pingResult && (
        <div className="mt-3 p-3 bg-gray-50 rounded-md border border-gray-200 text-sm text-gray-700">
          {pingResult}
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400 text-center">
        v0.1.0 — Extension Shell
      </p>
    </div>
  );
}

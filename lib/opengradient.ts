import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const OG_LLM_ENDPOINT =
  "https://llmogevm.opengradient.ai/v1/chat/completions";

/**
 * Create an x402-wrapped fetch client with the given private key.
 * The returned function works like native fetch() but auto-handles
 * 402 Payment Required responses by signing EIP-712 payment proofs.
 */
export function createX402Client(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);

  const client = new x402Client().register(
    "eip155:84532",
    new ExactEvmScheme(account),
  );

  return wrapFetchWithPayment(fetch, client);
}

/**
 * Make a test LLM call to validate the x402 integration.
 * Uses openai/gpt-4o with minimal tokens to minimize cost.
 */
export async function testLLMCall(x402Fetch: typeof fetch): Promise<{
  success: boolean;
  content?: string;
  model?: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  error?: string;
}> {
  try {
    const response = await x402Fetch(OG_LLM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o",
        messages: [
          {
            role: "user",
            content: "Respond with exactly: x402 connection verified",
          },
        ],
        max_tokens: 20,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${text}` };
    }

    const data = await response.json();
    return {
      success: true,
      content: data.choices?.[0]?.message?.content,
      model: data.model,
      usage: data.usage,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

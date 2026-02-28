import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { getAddress, toHex } from "viem";

const OG_LLM_ENDPOINT =
  "https://llm.opengradient.ai/v1/chat/completions";

/** OpenGradient's custom Permit2 contract (NOT the standard Uniswap Permit2) */
const OG_PERMIT2_ADDRESS = "0xA2820a4d4F3A8c5Fa4eaEBF45B093173105a8f8F";

/** OpenGradient's upto Permit2 proxy spender */
const OG_UPTO_PERMIT2_PROXY = "0xdB9F7863C9E06Daf21aD43663a06a2f43d303Fa7";

/** EIP-712 types for Permit2 witness transfer */
const permit2WitnessTypes = {
  PermitWitnessTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "witness", type: "Witness" },
  ],
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  Witness: [
    { name: "to", type: "address" },
    { name: "validAfter", type: "uint256" },
    { name: "extra", type: "bytes" },
  ],
} as const;

function createPermit2Nonce(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  return BigInt(toHex(randomBytes)).toString();
}

/**
 * UptoEvmScheme implements the "upto" payment scheme for x402v2.
 * Uses the same Permit2 signing logic as ExactEvmScheme, but targets
 * the x402UptoPermit2Proxy spender address instead of the exact proxy.
 */
class UptoEvmScheme {
  readonly scheme = "upto" as const;
  private signer: ReturnType<typeof privateKeyToAccount>;

  constructor(signer: ReturnType<typeof privateKeyToAccount>) {
    this.signer = signer;
  }

  async createPaymentPayload(x402Version: number, paymentRequirements: any) {
    const now = Math.floor(Date.now() / 1000);
    const nonce = createPermit2Nonce();
    const validAfter = (now - 600).toString();
    const deadline = (now + paymentRequirements.maxTimeoutSeconds).toString();
    const chainId = parseInt(paymentRequirements.network.split(":")[1]);

    const permit2Authorization = {
      from: this.signer.address,
      permitted: {
        token: getAddress(paymentRequirements.asset),
        amount: paymentRequirements.amount,
      },
      spender: OG_UPTO_PERMIT2_PROXY,
      nonce,
      deadline,
      witness: {
        to: getAddress(paymentRequirements.payTo),
        validAfter,
        extra: "0x" as `0x${string}`,
      },
    };

    const signature = await this.signer.signTypedData({
      domain: {
        name: "Permit2",
        chainId,
        verifyingContract: OG_PERMIT2_ADDRESS as `0x${string}`,
      },
      types: permit2WitnessTypes,
      primaryType: "PermitWitnessTransferFrom",
      message: {
        permitted: {
          token: getAddress(paymentRequirements.asset),
          amount: BigInt(paymentRequirements.amount),
        },
        spender: getAddress(OG_UPTO_PERMIT2_PROXY),
        nonce: BigInt(nonce),
        deadline: BigInt(deadline),
        witness: {
          to: getAddress(paymentRequirements.payTo),
          validAfter: BigInt(validAfter),
          extra: "0x" as `0x${string}`,
        },
      },
    });

    return {
      x402Version,
      payload: {
        signature,
        permit2Authorization,
      },
    };
  }
}

/**
 * Create an x402-wrapped fetch client with the given private key.
 * Registers both "exact" and "upto" schemes for eip155:84532 (Base Sepolia).
 */
export function createX402Client(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  const client = new x402Client();

  // Register "exact" scheme for Base Sepolia (standard)
  client.register("eip155:84532", new ExactEvmScheme(account));

  // Register "upto" scheme for Base Sepolia (what llm.opengradient.ai requires)
  client.register("eip155:84532", new UptoEvmScheme(account));

  return wrapFetchWithPayment(fetch, client);
}

/**
 * Make a test LLM call to validate the x402 integration.
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
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "X-SETTLEMENT-TYPE": "settle-batch",
      },
      body: JSON.stringify({
        model: "gpt-4o",
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

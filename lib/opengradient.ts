import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { getAddress, toHex } from "viem";
import {
  TASK_EXTRACTION_SYSTEM_PROMPT,
  buildSystemPrompt,
  parseTasksFromLLMResponse,
  type RawTask,
} from "@/lib/task-extractor";
import { getTagPatterns } from "@/lib/storage";

const OG_LLM_ENDPOINT =
  "https://og-proxy-production.up.railway.app/v1/chat/completions";

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

/**
 * Extract tasks from text using OpenGradient's TEE-verified LLM inference.
 *
 * Uses `anthropic/claude-4.0-sonnet` as the primary model (AI-02).
 * If Claude is unavailable, `openai/gpt-4o` is a proven fallback (tested in Phase 1).
 *
 * Settlement mode is `individual` (SETTLE_METADATA) which records full input/output
 * metadata on-chain for TEE attestation (satisfies AI-05, AI-06, AI-07).
 *
 * The transaction hash is extracted from the X-PAYMENT-RESPONSE header (base64-encoded
 * JSON with a `transaction` field). This hash is the cryptographic reference to the
 * TEE attestation document on the OpenGradient chain.
 *
 * @param x402Fetch - An x402-wrapped fetch client (from createX402Client)
 * @param text - Raw text to extract tasks from
 * @returns Raw tasks parsed from LLM output + the on-chain transaction hash (or null)
 */
export async function extractTasksWithProof(
  x402Fetch: typeof fetch,
  text: string,
): Promise<{ rawTasks: RawTask[]; txHash: string | null }> {
  const patterns = await getTagPatterns();
  const systemPrompt = buildSystemPrompt(patterns);

  const response = await x402Fetch(OG_LLM_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Bearer 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "X-SETTLEMENT-TYPE": "individual",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      max_tokens: 2000,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM inference failed: HTTP ${response.status}: ${errorText}`,
    );
  }

  // Extract transaction hash from X-PAYMENT-RESPONSE header (base64-encoded JSON)
  let txHash: string | null = null;
  const paymentResponse = response.headers.get("x-payment-response");
  if (paymentResponse) {
    try {
      const decoded = JSON.parse(atob(paymentResponse));
      txHash = decoded.transaction ?? null;
    } catch {
      // Header decode failed -- non-fatal, txHash stays null
    }
  }

  // Parse LLM response (OpenAI chat completions format)
  const data = await response.json();
  const content: string = data.choices?.[0]?.message?.content ?? "";
  console.log("[extractTasksWithProof] LLM response content:", content.slice(0, 500));
  const rawTasks = parseTasksFromLLMResponse(content);
  console.log("[extractTasksWithProof] Parsed tasks:", rawTasks.length);

  return { rawTasks, txHash };
}

/** Groq key — used ONLY for Whisper transcription (from .env) */
const GROQ_KEY = import.meta.env.VITE_GROQ_KEY ?? "";

/**
 * Transcribe audio via Groq Whisper (free, reliable, any language).
 */
export async function transcribeAudio(
  audioDataUrl: string,
  lang?: string,
): Promise<string> {
  const dataResp = await fetch(audioDataUrl);
  const blob = await dataResp.blob();

  console.log("[transcribe] blob size:", blob.size, "type:", blob.type);

  const ext = blob.type.includes("ogg") ? "ogg"
    : blob.type.includes("mp4") ? "mp4"
    : "webm";

  const formData = new FormData();
  formData.append("file", blob, `recording.${ext}`);
  formData.append("model", "whisper-large-v3-turbo");
  if (lang) formData.append("language", lang.split("-")[0]);

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whisper transcription failed: ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.text || "";
}

/**
 * extractTasksFromImage is removed — OpenGradient TEE does not support vision/multimodal.
 * Screenshots are handled by OCR (Tesseract.js) in the popup, then sent as text
 * through extractTasksWithProof.
 */

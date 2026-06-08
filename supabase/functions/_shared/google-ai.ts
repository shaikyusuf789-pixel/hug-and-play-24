export type GeminiTextOptions = {
  model?: string;
  system?: string;
  user: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: "text/plain" | "application/json";
};

export function normalizeGeminiModel(model: string | undefined, fallback = "gemini-2.5-pro") {
  const raw = (model || fallback).trim().replace(/^google\//, "");
  const lower = raw.toLowerCase();

  if (!raw) return fallback;
  if (lower.includes("gpt-4o-mini") || lower.includes("gpt-4.0mini") || lower.includes("mini")) {
    return "gemini-2.5-flash-lite";
  }
  if (lower.startsWith("gpt-") || lower.includes("openai")) return "gemini-2.5-pro";
  if (lower.startsWith("gemini-") || lower.startsWith("google/")) return raw.replace(/^google\//, "");

  return fallback;

}

export function requireGoogleApiKey() {
  const key = Deno.env.get("GOOGLE_API_KEY")?.trim();
  if (!key) throw new Error("GOOGLE_API_KEY is not configured");
  if (key.startsWith("ya29.") || key.startsWith("AQ.")) {
    throw new Error("GOOGLE_API_KEY is currently a Google OAuth token, not a Google AI Studio API key. Replace it with an AI Studio API key that starts with AIza.");
  }
  if (!key.startsWith("AIza")) {
    throw new Error("GOOGLE_API_KEY is not a valid Google AI Studio API key format. It must start with AIza.");
  }
  return key;
}

export function assertGoogleAiStudioApiKey(apiKey: string) {
  const key = apiKey.trim();
  if (!key) throw new Error("GOOGLE_API_KEY is not configured");
  if (key.startsWith("ya29.") || key.startsWith("AQ.")) {
    throw new Error("GOOGLE_API_KEY is currently a Google OAuth token, not a Google AI Studio API key. Replace it with an AI Studio API key that starts with AIza.");
  }
  if (!key.startsWith("AIza")) {
    throw new Error("GOOGLE_API_KEY is not a valid Google AI Studio API key format. It must start with AIza.");
  }
  return key;
}

function googleUrl(model: string, apiKey: string, stream = false) {
  const action = stream ? "streamGenerateContent?alt=sse" : "generateContent";
  const join = stream ? "&" : "?";
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${action}${join}key=${encodeURIComponent(assertGoogleAiStudioApiKey(apiKey))}`;
}

// Gemini 3.x Pro / reasoning models deprecated `temperature` and silently
// burn tokens on internal "thinking". Detect them so we can drop temperature
// and bump output budget so style/transcript instructions actually reach the
// final visible output.
function isReasoningProModel(model: string) {
  const m = model.toLowerCase();
  return /gemini-3(\.\d+)?-pro/.test(m);
}

export function buildGeminiBody(options: GeminiTextOptions) {
  const modelName = (options.model || "").toLowerCase();
  const reasoning = isReasoningProModel(modelName);

  const generationConfig: Record<string, unknown> = {};
  if (!reasoning) {
    generationConfig.temperature = options.temperature ?? 0.2;
  }
  if (options.responseMimeType) {
    generationConfig.responseMimeType = options.responseMimeType;
  }
  // Default high so reasoning tokens don't starve the visible output.
  generationConfig.maxOutputTokens = options.maxOutputTokens ?? (reasoning ? 32000 : 8192);

  const body: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: options.user }],
      },
    ],
    generationConfig,
  };

  if (options.system?.trim()) {
    body.systemInstruction = { parts: [{ text: options.system }] };
  }

  return body;
}

export function extractGeminiText(payload: any) {
  return (payload?.candidates?.[0]?.content?.parts ?? [])
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

export function extractGeminiFinishReason(payload: any): string | null {
  return payload?.candidates?.[0]?.finishReason ?? null;
}

export async function geminiGenerateText(apiKey: string, options: GeminiTextOptions) {
  const model = normalizeGeminiModel(options.model);
  const response = await fetch(googleUrl(model, apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildGeminiBody({ ...options, model })),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Google AI error ${response.status} [model=${model}]: ${errorText.slice(0, 1000)}`);
  }

  const json = await response.json();
  const text = extractGeminiText(json);
  const finishReason = extractGeminiFinishReason(json);
  const usage = json?.usageMetadata;

  console.log(`[gemini] model=${model} finishReason=${finishReason} usage=${JSON.stringify(usage)} textLen=${text.length}`);

  if (!text) {
    const hint = finishReason === "MAX_TOKENS"
      ? " (MAX_TOKENS -- reasoning tokens consumed the budget; increase maxOutputTokens or trim input)"
      : "";
    throw new Error(`Google AI returned an empty response [model=${model} finishReason=${finishReason}]${hint} usage=${JSON.stringify(usage)}`);
  }
  return text;
}

export async function geminiGenerateJson<T = any>(apiKey: string, options: GeminiTextOptions) {
  const text = await geminiGenerateText(apiKey, { ...options, responseMimeType: "application/json" });
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const jsonText = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(jsonText) as T;
}

export async function geminiStreamResponse(apiKey: string, options: GeminiTextOptions) {
  const model = normalizeGeminiModel(options.model);
  return fetch(googleUrl(model, apiKey, true), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildGeminiBody({ ...options, model })),
  });
}

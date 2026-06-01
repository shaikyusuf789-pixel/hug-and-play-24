type GeminiTextOptions = {
  model?: string;
  system?: string;
  user: string;
  temperature?: number;
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
  if (lower === "gemini-3-pro-preview" || lower === "gemini-3-flash-preview") return "gemini-2.5-pro";
  if (lower.startsWith("gemini-")) return raw;

  return fallback;
}

export function assertGoogleAiStudioApiKey(apiKey: string) {
  const key = apiKey.trim();
  if (!key) throw new Error("GOOGLE_API_KEY is not configured in project secrets.");

  if (key.startsWith("ya29.") || key.startsWith("AQ.")) {
    throw new Error(
      "GOOGLE_API_KEY is currently a Google OAuth token, not a Google AI Studio API key. Replace it with an AI Studio API key that starts with AIza.",
    );
  }

  if (!key.startsWith("AIza")) {
    throw new Error(
      "GOOGLE_API_KEY is not a valid Google AI Studio API key format. It must start with AIza.",
    );
  }

  return key;
}

function googleUrl(model: string, apiKey: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(assertGoogleAiStudioApiKey(apiKey))}`;
}

function buildGeminiBody(options: GeminiTextOptions) {
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: options.user }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.2,
      ...(options.responseMimeType ? { responseMimeType: options.responseMimeType } : {}),
    },
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

export async function geminiGenerateText(apiKey: string, options: GeminiTextOptions) {
  const model = normalizeGeminiModel(options.model);
  const response = await fetch(googleUrl(model, apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildGeminiBody({ ...options, model })),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Google AI error ${response.status}: ${errorText.slice(0, 1000)}`);
  }

  const json = await response.json();
  const text = extractGeminiText(json);
  if (!text) throw new Error("Google AI returned an empty response");
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
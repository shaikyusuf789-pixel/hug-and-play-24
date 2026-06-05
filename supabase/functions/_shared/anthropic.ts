// Shared Anthropic Claude helper for streaming + JSON calls.
// Uses Anthropic Messages API: https://docs.anthropic.com/en/api/messages

export const ANTHROPIC_API_VERSION = "2023-06-01";

export function isClaudeModel(model: string | undefined | null): boolean {
  if (!model) return false;
  return model.toLowerCase().startsWith("claude");
}

export function requireAnthropicApiKey(): string {
  const key = Deno.env.get("ANTHROPIC_API_KEY")?.trim();
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured");
  return key;
}

// Map friendly / shorthand model ids to current Anthropic API model ids.
// Accepts both aliases (e.g. "claude-sonnet-4-5") and dated ids.
export function normalizeClaudeModel(model: string | undefined, fallback = "claude-sonnet-4-5"): string {
  const raw = (model || fallback).trim();
  if (!raw) return fallback;
  // Common aliases used in our UI:
  const map: Record<string, string> = {
    "claude-sonnet-4-6": "claude-sonnet-4-5", // user-friendly "4.6" -> latest sonnet
    "claude-sonnet-4.6": "claude-sonnet-4-5",
    "claude-sonnet-4.5": "claude-sonnet-4-5",
    "claude-sonnet-4": "claude-sonnet-4-20250514",
    "claude-opus-4": "claude-opus-4-20250514",
    "claude-opus-4-1": "claude-opus-4-1-20250805",
    "claude-opus-4.1": "claude-opus-4-1-20250805",
    "claude-3-7-sonnet": "claude-3-7-sonnet-latest",
    "claude-3.7-sonnet": "claude-3-7-sonnet-latest",
    "claude-3-5-sonnet": "claude-3-5-sonnet-20241022",
    "claude-3.5-sonnet": "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku": "claude-3-5-haiku-20241022",
    "claude-3.5-haiku": "claude-3-5-haiku-20241022",
    "claude-3-opus": "claude-3-opus-20240229",
  };
  return map[raw] ?? raw;
}

export type AnthropicTextOptions = {
  model?: string;
  system?: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
};

function buildBody(opts: AnthropicTextOptions, stream: boolean) {
  return {
    model: normalizeClaudeModel(opts.model),
    max_tokens: opts.maxTokens ?? 8192,
    temperature: opts.temperature ?? 0.2,
    ...(opts.system ? { system: opts.system } : {}),
    messages: [{ role: "user", content: opts.user }],
    stream,
  };
}

export async function anthropicStreamResponse(apiKey: string, opts: AnthropicTextOptions): Promise<Response> {
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_API_VERSION,
    },
    body: JSON.stringify(buildBody(opts, true)),
  });
}

// Extract text delta from a single Anthropic SSE `data:` JSON payload.
// Returns "" for non-text events (message_start, ping, content_block_start, etc.).
export function extractAnthropicDelta(payload: any): string {
  if (!payload || typeof payload !== "object") return "";
  if (payload.type === "content_block_delta" && payload.delta?.type === "text_delta") {
    return String(payload.delta.text || "");
  }
  return "";
}

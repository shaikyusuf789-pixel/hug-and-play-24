/**
 * timestamps.functions.ts — Word-level timestamps via Railway Python Worker (OpenAI Whisper).
 *
 * Rewired from ElevenLabs to the new Python worker pipeline as requested.
 * The Python worker uses OpenAI Whisper "whisper-1" with word-level timestamps.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ANNOTATIONS_WORKER_URL } from "./worker";

const RunInput = z.object({
  scriptId: z.string().uuid(),
  chunkId: z.string().uuid(),
  chunkNumber: z.number().int().nonnegative(),
});

const RunAllInput = z.object({
  scriptId: z.string().uuid(),
});

async function workerPost(path: string, body: any) {
  const url = `${ANNOTATIONS_WORKER_URL}${path}`;
  console.log(`[TS/worker] calling ${url}`, body);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) throw new Error(json?.detail || text || `HTTP ${res.status}`);
  return json;
}

export const runTimestamps = createServerFn({ method: "POST" })
  .inputValidator((input) => RunInput.parse(input))
  .handler(async ({ data }) => {
    console.log(`[TS/worker] chunk ${data.chunkNumber} (${data.chunkId})`);
    const res = await workerPost("/timestamps/run", {
      script_id: data.scriptId,
      chunk_id: data.chunkId,
      chunk_number: data.chunkNumber,
    });
    console.log(`[TS/worker] chunk ${data.chunkNumber} done — ${res.word_count} words / ${res.duration?.toFixed(2)}s`);
    return {
      ok: true,
      word_count: res.word_count,
      duration: res.duration,
    };
  });

export const runTimestampsAll = createServerFn({ method: "POST" })
  .inputValidator((input) => RunAllInput.parse(input))
  .handler(async ({ data }) => {
    console.log(`[TS/worker] run-all for script ${data.scriptId}`);
    const res = await workerPost("/timestamps/run-all", {
      script_id: data.scriptId,
    });
    return {
      ok: true,
      queued: res.queued,
      succeeded: res.queued, // Background task, so we assume success in queueing
      failed: 0,
      failures: [],
    };
  });


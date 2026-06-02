/**
 * ocr.functions.ts — OCR via Google Cloud Vision API.
 *
 * Replaces Railway /ocr/run + /ocr/run-all endpoints. Calls Google Vision
 * DOCUMENT_TEXT_DETECTION directly on slide PNGs (public `slides` bucket)
 * and upserts word-level bounding boxes to public.ocr_results in the same
 * shape Railway used:
 *   words = JSON.stringify([{text,x,y,w,h,conf}, ...])
 *
 * Railway worker still exists; this just cuts the wire from the UI.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const RunInput = z.object({
  scriptId: z.string().uuid(),
  chunkId: z.string().uuid(),
  chunkNumber: z.number().int().nonnegative(),
  slideSource: z.string().min(1),
});

const RunAllInput = z.object({
  scriptId: z.string().uuid(),
  slideSource: z.string().min(1),
});

type Word = { text: string; x: number; y: number; w: number; h: number; conf: number };

function slidePath(scriptId: string, chunkNumber: number): string {
  const n = String(chunkNumber + 1).padStart(3, "0");
  return `${scriptId}/slide_${n}.png`;
}

function slidePublicUrl(scriptId: string, chunkNumber: number): string {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!base) throw new Error("SUPABASE_URL not configured");
  return `${base}/storage/v1/object/public/slides/${slidePath(scriptId, chunkNumber)}`;
}

function bboxFromVertices(vs: Array<{ x?: number; y?: number }>): { x: number; y: number; w: number; h: number } {
  const xs = vs.map((v) => v.x ?? 0);
  const ys = vs.map((v) => v.y ?? 0);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(...xs) - x;
  const h = Math.max(...ys) - y;
  return { x, y, w, h };
}

async function visionOcr(imageUrl: string): Promise<Word[]> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_VISION_API_KEY is not configured");

  // Fetch image bytes and base64-encode (more reliable than imageUri).
  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) throw new Error(`download slide failed: HTTP ${imgResp.status}`);
  const buf = Buffer.from(await imgResp.arrayBuffer());
  const b64 = buf.toString("base64");

  const body = {
    requests: [
      {
        image: { content: b64 },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
      },
    ],
  };

  const resp = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Google Vision failed ${resp.status}: ${t.slice(0, 500)}`);
  }

  const json: any = await resp.json();
  const r0 = json?.responses?.[0];
  if (r0?.error) throw new Error(`Vision API error: ${r0.error.message}`);

  const fta = r0?.fullTextAnnotation;
  const words: Word[] = [];
  if (!fta?.pages) return words;

  for (const page of fta.pages) {
    for (const block of page.blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        for (const wd of para.words ?? []) {
          const text = (wd.symbols ?? []).map((s: any) => s.text ?? "").join("").trim();
          if (!text) continue;
          const verts = wd.boundingBox?.vertices ?? wd.boundingBox?.normalizedVertices ?? [];
          if (!verts.length) continue;
          const { x, y, w, h } = bboxFromVertices(verts);
          const conf = Math.round(((wd.confidence ?? 0) * 100) * 10) / 10;
          if (conf > 0 && conf < 30) continue; // match old Tesseract conf>30 filter
          words.push({ text, x, y, w, h, conf });
        }
      }
    }
  }

  return words;
}

async function ocrOneChunk(
  scriptId: string,
  chunkId: string,
  chunkNumber: number,
  slideSource: string,
): Promise<{ wordCount: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const url = slidePublicUrl(scriptId, chunkNumber);
  const words = await visionOcr(url);

  const { error } = await supabaseAdmin
    .from("ocr_results")
    .upsert(
      {
        script_id: scriptId,
        chunk_id: chunkId,
        chunk_number: chunkNumber,
        slide_source: slideSource,
        words: JSON.stringify(words),
      },
      { onConflict: "script_id,chunk_id,slide_source" },
    );
  if (error) throw new Error(`upsert ocr_results failed: ${error.message}`);

  return { wordCount: words.length };
}

export const runOcr = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RunInput.parse(input))
  .handler(async ({ data }) => {
    const res = await ocrOneChunk(data.scriptId, data.chunkId, data.chunkNumber, data.slideSource);
    return { ok: true, word_count: res.wordCount };
  });

export const runOcrAll = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RunAllInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: chunks, error } = await supabaseAdmin
      .from("script_chunks")
      .select("id,chunk_index")
      .eq("script_id", data.scriptId)
      .order("chunk_index");
    if (error) throw new Error(`load chunks failed: ${error.message}`);

    let succeeded = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const c of chunks ?? []) {
      try {
        await ocrOneChunk(data.scriptId, c.id as string, c.chunk_index as number, data.slideSource);
        succeeded++;
      } catch (e: any) {
        failed++;
        errors.push(`chunk ${c.chunk_index}: ${e?.message ?? e}`);
      }
    }
    return { ok: failed === 0, queued: chunks?.length ?? 0, succeeded, failed, errors };
  });

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SECRET_KEYS")?.match(/sb_secret_[A-Za-z0-9_-]+/)?.[0]
  ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  ?? Deno.env.get("CUSTOM_SUPABASE_SERVICE_ROLE_KEY")
  ?? "";

// Reclaim stale "processing" jobs after this many minutes (worker crashed mid-way)
const STALE_MINUTES = 8;

async function callFunction(name: string, body: any) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep null */ }
  if (!r.ok) throw new Error(json?.error || text || `HTTP ${r.status}`);
  return json;
}

async function reclaimStale(sb: any) {
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
  await sb.from("script_chunks").update({ slide_job_status: "queued" })
    .eq("slide_job_status", "processing").lt("slide_job_started_at", cutoff);
  await sb.from("script_chunks").update({ audio_job_status: "queued" })
    .eq("audio_job_status", "processing").lt("audio_job_started_at", cutoff);
  // Render-clip watchdog: worker crashed mid-render → reset to pending
  await sb.from("video_clips")
    .update({ status: "pending", error_msg: "reclaimed: stuck in rendering" })
    .eq("status", "rendering").lt("updated_at", cutoff);
}

// Atomically claim one queued slide chunk (queued → processing)
async function claimSlide(sb: any, scriptId?: string) {
  const q = sb.from("script_chunks").select("id, script_id, slide_job_theme")
    .eq("slide_job_status", "queued").order("chunk_index", { ascending: true }).limit(1);
  if (scriptId) q.eq("script_id", scriptId);
  const { data, error } = await q;
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  const { data: updated, error: upErr } = await sb.from("script_chunks")
    .update({ slide_job_status: "processing", slide_job_started_at: new Date().toISOString(), slide_job_error: null })
    .eq("id", row.id).eq("slide_job_status", "queued")
    .select("id, slide_job_theme").maybeSingle();
  if (upErr) throw upErr;
  return updated; // null if race lost
}

async function claimAudio(sb: any, scriptId?: string) {
  const q = sb.from("script_chunks").select("id, script_id, audio_job_provider, audio_job_voice_id, audio_job_model")
    .eq("audio_job_status", "queued").order("chunk_index", { ascending: true }).limit(1);
  if (scriptId) q.eq("script_id", scriptId);
  const { data, error } = await q;
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  const { data: updated, error: upErr } = await sb.from("script_chunks")
    .update({ audio_job_status: "processing", audio_job_started_at: new Date().toISOString(), audio_job_error: null })
    .eq("id", row.id).eq("audio_job_status", "queued")
    .select("id, audio_job_provider, audio_job_voice_id, audio_job_model").maybeSingle();
  if (upErr) throw upErr;
  return updated;
}


async function processOneSlide(sb: any, scriptId?: string): Promise<boolean> {
  const claim = await claimSlide(sb, scriptId);
  if (!claim) return false;
  try {
    await callFunction("generate-slides", {
      chunkId: claim.id,
      action: "generate-slide",
      themeName: claim.slide_job_theme || "Oasis",
    });
    await sb.from("script_chunks").update({ slide_job_status: "done", slide_job_error: null }).eq("id", claim.id);
  } catch (e: any) {
    await sb.from("script_chunks").update({ slide_job_status: "failed", slide_job_error: String(e?.message || e) }).eq("id", claim.id);
  }
  return true;
}

async function processOneAudio(sb: any, scriptId?: string): Promise<boolean> {
  const claim = await claimAudio(sb, scriptId);
  if (!claim) return false;
  try {
    await callFunction("generate-audio", {
      chunkId: claim.id,
      provider: claim.audio_job_provider || "elevenlabs",
      voiceId: claim.audio_job_voice_id || undefined,
      model: claim.audio_job_model || undefined,
    });

    await sb.from("script_chunks").update({ audio_job_status: "done", audio_job_error: null }).eq("id", claim.id);
  } catch (e: any) {
    await sb.from("script_chunks").update({ audio_job_status: "failed", audio_job_error: String(e?.message || e) }).eq("id", claim.id);
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  let scriptId: string | undefined;
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      scriptId = body?.scriptId;
    }
  } catch { /* ignore */ }

  // Background worker — return immediately so caller doesn't wait
  const work = (async () => {
    try {
      await reclaimStale(sb);
      const started = Date.now();
      const MAX_MS = 300_000; // 5 minutes safety budget per invocation
      let processedSlide = 0, processedAudio = 0;
      // Drain both queues fairly
      while (Date.now() - started < MAX_MS) {
        const didSlide = await processOneSlide(sb, scriptId);
        if (didSlide) processedSlide++;
        const didAudio = await processOneAudio(sb, scriptId);
        if (didAudio) processedAudio++;
        if (!didSlide && !didAudio) break;
      }
      console.log(`process-queue done: slides=${processedSlide} audios=${processedAudio}`);
    } catch (e) {
      console.error("process-queue worker error:", e);
    }
  })();

  // @ts-ignore EdgeRuntime is provided by Supabase Edge runtime
  if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(work);
  }

  return new Response(JSON.stringify({ ok: true, scriptId: scriptId || null }), {
    status: 202,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

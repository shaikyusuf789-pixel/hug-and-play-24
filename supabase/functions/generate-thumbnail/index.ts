// Sky Studio thumbnail generator — used by YouTube page & Jerry.
// Generates an image with one of 7 models (OpenAI or Google), uploads to
// user-uploads/thumbnails/, and ALWAYS records the row in thumbnail_library
// (permanent — never deleted).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_MODELS = new Set([
  "openai/gpt-image-2",
  "openai/gpt-image-1",
  "openai/gpt-image-1-mini",
  "openai/dall-e-3",
  "google/gemini-3-pro-image-preview",
  "google/gemini-3.1-flash-image-preview",
  "google/gemini-2.5-flash-image",
]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json();
    const action = body.action || "generate";

    // ---------- LIST REFS ----------
    if (action === "list-refs") {
      const limit = Math.min(Math.max(Number(body.limit) || 6, 1), 20);
      const { data } = await supabase
        .from("thumbnail_library")
        .select("id, url, prompt, lines, model, created_at")
        .eq("is_sky_style", true)
        .order("created_at", { ascending: false })
        .limit(limit);
      return new Response(JSON.stringify({ refs: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- GENERATE / EDIT ----------
    const model = body.model || "openai/gpt-image-2";
    if (!ALLOWED_MODELS.has(model)) {
      return new Response(JSON.stringify({ error: `Unknown model: ${model}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const prompt: string = body.prompt;
    if (!prompt) {
      return new Response(JSON.stringify({ error: "prompt is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const size: string = body.size || "1792x1024";
    const lines = body.lines || null;
    const scriptId = body.script_id || null;
    const source: string = body.source || "youtube_page";
    const editImageUrl: string | null = body.edit_image_url || null;

    // Pull Sky-style references and append as guidance to the prompt
    let stylePrompt = prompt;
    let refImages: string[] = [];
    if (body.use_refs !== false) {
      const { data: refs } = await supabase
        .from("thumbnail_library")
        .select("url, prompt")
        .eq("is_sky_style", true)
        .order("created_at", { ascending: false })
        .limit(4);
      if (refs && refs.length) {
        refImages = refs.map((r: any) => r.url);
        const pastPrompts = refs.map((r: any, i: number) => `[${i + 1}] ${r.prompt || ""}`).join("\n");
        stylePrompt = `${prompt}\n\n[SKY STYLE REFERENCE — match the visual DNA of these prior Sky Studio thumbnails: bold uppercase typography, premium coaching-institute look, blue/white/yellow accents, strong contrast, photoshop-edited feel]\nPast Sky prompts:\n${pastPrompts}`;
      }
    }

    // Fetch source bytes if editing
    let srcB64: string | null = null;
    if (editImageUrl) {
      const ir = await fetch(editImageUrl);
      if (ir.ok) {
        const buf = new Uint8Array(await ir.arrayBuffer());
        let bin = ""; for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
        srcB64 = btoa(bin);
      }
    }

    let b64: string | null = null;
    let mime = "image/png";

    if (model.startsWith("openai/")) {
      const openaiKey = Deno.env.get("OPENAI_API_KEY");
      if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");
      const openaiModel = model.replace("openai/", "");
      if (editImageUrl && srcB64) {
        const form = new FormData();
        form.append("model", openaiModel);
        form.append("prompt", stylePrompt);
        form.append("size", size);
        const imgBlob = new Blob([Uint8Array.from(atob(srcB64), c => c.charCodeAt(0))], { type: "image/png" });
        form.append("image", imgBlob, "source.png");
        const r = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST", headers: { Authorization: `Bearer ${openaiKey}` }, body: form,
        });
        const j = await r.json();
        if (j.error) throw new Error(`OpenAI: ${j.error.message}`);
        b64 = j.data?.[0]?.b64_json;
      } else {
        const r = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
          body: JSON.stringify({ model: openaiModel, prompt: stylePrompt, size, n: 1 }),
        });
        const j = await r.json();
        if (j.error) throw new Error(`OpenAI: ${j.error.message}`);
        b64 = j.data?.[0]?.b64_json;
        if (!b64 && j.data?.[0]?.url) {
          const ir = await fetch(j.data[0].url);
          const buf = new Uint8Array(await ir.arrayBuffer());
          let bin = ""; for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
          b64 = btoa(bin);
        }
      }
    } else {
      // google/*
      const googleKey = Deno.env.get("GOOGLE_API_KEY");
      if (!googleKey) throw new Error("GOOGLE_API_KEY not configured");
      const googleModel = model.replace("google/", "");
      const parts: any[] = [{ text: stylePrompt }];
      // Include source image (edit) and/or reference images for visual style transfer
      if (srcB64) parts.push({ inlineData: { mimeType: "image/png", data: srcB64 } });
      // Attach top 2 ref images to Gemini for visual style transfer (Gemini supports multi-image input)
      for (const refUrl of refImages.slice(0, 2)) {
        try {
          const ir = await fetch(refUrl);
          if (!ir.ok) continue;
          const ct = ir.headers.get("content-type") || "image/png";
          const buf = new Uint8Array(await ir.arrayBuffer());
          let bin = ""; for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
          parts.push({ inlineData: { mimeType: ct, data: btoa(bin) } });
        } catch { /* skip ref on failure */ }
      }
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${googleModel}:generateContent?key=${googleKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
          }),
        }
      );
      const j = await r.json();
      if (j.error) throw new Error(`Google: ${j.error.message}`);
      const inline = j.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData;
      if (inline) { b64 = inline.data; mime = inline.mimeType || "image/png"; }
    }

    if (!b64) throw new Error("No image returned from model");

    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const ext = mime.includes("jpeg") ? "jpg" : "png";
    const path = `thumbnails/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from("user-uploads").upload(path, bytes, { contentType: mime });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
    const { data: pub } = supabase.storage.from("user-uploads").getPublicUrl(path);
    const url = pub.publicUrl;

    // Permanent archive insert (never deleted)
    const { error: insErr } = await supabase.from("thumbnail_library").insert({
      url, prompt, lines, model, script_id: scriptId, source, is_sky_style: true,
    });
    if (insErr) console.error("thumbnail_library insert:", insErr.message);

    return new Response(JSON.stringify({ url, model, refs_used: refImages.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-thumbnail error:", e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

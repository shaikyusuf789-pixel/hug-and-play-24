// supabase/functions/clean-script-envelope/index.ts
// One-off utility: strips {"script":"..."} JSON envelope from a stored script row.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function getSupabaseServiceKey() {
  return Deno.env.get("SUPABASE_SECRET_KEYS")?.match(/sb_secret_[A-Za-z0-9_-]+/)?.[0]
    ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    ?? Deno.env.get("CUSTOM_SUPABASE_SERVICE_ROLE_KEY")
    ?? "";
}

function extractScript(raw: string): string {
  let t = (raw || "").trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  // Try strict JSON
  try {
    const o = JSON.parse(t);
    if (typeof o?.script === "string") return o.script;
  } catch (_) {}
  // Tolerant parse: allow raw control chars
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s !== -1 && e > s) {
    const slice = t.slice(s, e + 1);
    // Strip raw newlines/tabs inside the JSON before re-parsing
    try {
      const cleaned = slice.replace(/[\u0000-\u001F]/g, (c) =>
        c === "\n" ? "\\n" : c === "\r" ? "\\r" : c === "\t" ? "\\t" : "");
      const o = JSON.parse(cleaned);
      if (typeof o?.script === "string") return o.script;
    } catch (_) {}
    // Regex fallback: capture between "script":"..." and trailing "}
    const m = slice.match(/"script"\s*:\s*"([\s\S]*)"\s*\}\s*$/);
    if (m) {
      return m[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
  }
  return t;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { id } = await req.json();
    if (!id) {
      return new Response(JSON.stringify({ error: "id required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      getSupabaseServiceKey(),
    );
    const { data: row, error } = await supa
      .from("scripts")
      .select("id, content")
      .eq("id", id)
      .single();
    if (error || !row) {
      return new Response(JSON.stringify({ error: error?.message || "not found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const clean = extractScript(row.content || "");
    const wc = clean.split(/\s+/).filter(Boolean).length;
    const { error: uErr } = await supa
      .from("scripts")
      .update({ content: clean, word_count: wc })
      .eq("id", id);
    if (uErr) {
      return new Response(JSON.stringify({ error: uErr.message }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({ success: true, id, word_count: wc, chars: clean.length, preview: clean.slice(0, 200) }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

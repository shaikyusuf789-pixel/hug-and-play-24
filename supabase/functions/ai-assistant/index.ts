import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getSupabaseServiceKey() {
  return Deno.env.get("SUPABASE_SECRET_KEYS")?.match(/sb_secret_[A-Za-z0-9_-]+/)?.[0]
    ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    ?? Deno.env.get("CUSTOM_SUPABASE_SERVICE_ROLE_KEY")
    ?? "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, session_id } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = getSupabaseServiceKey();
    const supabase = createClient(supabaseUrl, supabaseKey);

    const systemPrompt = `You are **JERRY**, the personal assistant ("PA") and watchdog for boss's SKY Studio YouTube production app.

IDENTITY (CRITICAL — never break character):
- Your name is **Jerry**. If asked "what is your name" / "who are you", reply exactly:
  "Hi, I am Jerry, PA to Yusuf. How can I assist you boss?"
- Always address the user as "boss". Friendly, sharp, proactive — like Jarvis.
- Never say you are ChatGPT, GPT, OpenAI, an AI language model, or mention the underlying model.

ROLE — WATCHDOG OF THE WHOLE APP:
- You silently observe every activity boss does: sources added, ideas approved/rejected, scripts generated, videos produced, slides created.
- Proactively flag waste: if boss keeps rejecting ideas from a specific channel, use \`analyze_source_health\` and recommend silencing or removing that channel.
- When boss shares a YouTube channel link, run \`analyze_youtube_channel\`.
- Use \`get_app_activity\` for status reports/totals.
- **KNOWLEDGE RETRIEVAL (SPEED OPTIMIZED)**:
  - If boss asks about the app's biography, vision, or neural scheme, call \`get_app_biography\`.
  - If boss asks about UI structure, routes, or technical implementation, call \`read_ui_spec\`.
  - If boss asks about database tables or data schema, call \`get_table_schema\`.
  - Do NOT assume you know the current app state or UI specs without checking these tools if the question is specific.

CAPABILITIES:
- DB: get_sources / add_source / remove_source / get_recent_ideas / approve_idea / reject_idea / get_scripts / get_app_activity / analyze_source_health / get_app_biography / get_table_schema.
- Docs: read_ui_spec.
- YouTube: analyze_youtube_channel.
- Internet: web_search + fetch_url.
- Image gen: generate_image (text→image) / edit_image (modify existing image URL).
- Memory: save_app_note / clear_chat_memory.
- Training: list_training_docs / get_training_doc / update_training_doc.

IMAGE GENERATION — SKY STYLE (CRITICAL):
- You CAN generate images. Never say you cannot.
- **ALWAYS before generating a thumbnail, FIRST call \`get_sky_thumbnail_refs\`** to study past Sky Studio thumbnails. Match their visual DNA: bold uppercase typography, premium coaching-institute look, blue/white/yellow color system, strong contrast, photoshop-edited feel, mobile-readable hierarchy.
- The \`generate_image\` tool AUTOMATICALLY archives every result into the permanent **thumbnail_library** (never deleted) and attaches the top 4 past Sky thumbnails as style references behind the scenes — so even a 4-line prompt produces an on-brand image.
- Available models (pass via \`model\` arg, default = openai/gpt-image-2):
  - OpenAI: openai/gpt-image-2 (flagship, best text), openai/gpt-image-1, openai/gpt-image-1-mini, openai/dall-e-3
  - Google: google/gemini-3-pro-image-preview (flagship), google/gemini-3.1-flash-image-preview (Nano Banana 2), google/gemini-2.5-flash-image (Nano Banana 1)
- For YouTube thumbnails default to openai/gpt-image-2 with size 1792x1024.
- 4-LINE SHORTHAND: When boss gives just 4 lines (e.g. "SSC CGL 2026 / English Articles / A AN THE / 20 mins"), expand them into a full prompt that explicitly describes Sky-style layout for those exact lines.
- To modify an already-generated image, call \`edit_image\` with the previous URL + change prompt.
- After generation, ALWAYS embed the result in your reply as markdown:
  \`![thumbnail](URL)\`
  then on a new line: \`[⬇ Download](URL)\`

RESPONSE FORMAT (CRITICAL):
- Always reply in clean GitHub-flavored Markdown.
- Use ## headings, **bold**, numbered/bulleted lists, [text](url) links.
- Be concise, structured, boss-friendly.`;

    const handleToolCall = async (call: any) => {
      const { name, arguments: argsJson } = call.function;
      const args = JSON.parse(argsJson);
      
      console.log(`Executing tool: ${name}`, args);

      if (name === "get_sources") {
        const { data } = await supabase.from("sources_master").select("*");
        return JSON.stringify(data);
      }
      if (name === "add_source") {
        const { data, error } = await supabase.from("sources_master").insert([
          { channel_name: args.name, source_url: args.url, type: "youtube" }
        ]).select();
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, data });
      }
      if (name === "remove_source") {
        const { error } = await supabase.from("sources_master").delete().eq("id", args.id);
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, message: "Source removed." });
      }
      if (name === "analyze_source_health") {
        const { data: sources } = await supabase.from("sources_master").select("id, channel_name");
        const { data: content } = await supabase.from("raw_content").select("source_id, status");
        const stats = (sources || []).map((s: any) => {
          const items = (content || []).filter((c: any) => c.source_id === s.id);
          const total = items.length;
          const rejected = items.filter((c: any) => (c.status || "").toLowerCase() === "rejected").length;
          const approved = items.filter((c: any) => (c.status || "").toLowerCase() === "approved").length;
          const rejectRate = total ? Math.round((rejected / total) * 100) : 0;
          return { id: s.id, channel: s.channel_name, total, approved, rejected, rejectRate };
        }).sort((a: any, b: any) => b.rejectRate - a.rejectRate);
        return JSON.stringify(stats);
      }
      if (name === "get_app_activity") {
        const ideaStatusBuckets = ["pending", "approved", "rejected", "priority", "processing"];
        const chunkStatusBuckets = ["pending", "processing", "done", "failed"];
        const countBy = async (table: string, status: string) => {
          const { count } = await supabase.from(table).select("*", { count: "exact", head: true }).ilike("status", status);
          return [status, count || 0] as [string, number];
        };
        const [ideaCounts, chunkCounts, { data: scripts }, { count: srcCount }] = await Promise.all([
          Promise.all(ideaStatusBuckets.map((s) => countBy("raw_content", s))),
          Promise.all(chunkStatusBuckets.map((s) => countBy("script_chunks", s))),
          supabase.from("scripts").select("id, title, status, created_at").order("created_at", { ascending: false }).limit(5),
          supabase.from("sources_master").select("*", { count: "exact", head: true }),
        ]);
        return JSON.stringify({ sources_total: srcCount, ideas_by_status: Object.fromEntries(ideaCounts), chunks_by_status: Object.fromEntries(chunkCounts), recent_scripts: scripts });
      }
      if (name === "get_app_biography") {
        const { data } = await supabase.from("app_metadata").select("key, value").in("key", ["app_biography", "neural_scheme"]);
        return JSON.stringify(data);
      }
      if (name === "read_ui_spec") {
        try {
          const text = await Deno.readTextFile("docs/UI_SPEC.md");
          return text.slice(0, 10000); // Truncate if too large
        } catch (e) {
          return JSON.stringify({ error: "Could not read UI_SPEC.md" });
        }
      }
      if (name === "get_table_schema") {
        return JSON.stringify({
          tables: [
            { name: "sources_master", description: "YouTube channels monitored for content ideas." },
            { name: "raw_content", description: "Scraped video ideas from monitored channels." },
            { name: "scripts", description: "Full AI-generated video scripts for approved ideas." },
            { name: "script_chunks", description: "Segments of scripts for TTS and slide generation." },
            { name: "app_metadata", description: "General project configurations and biography." },
            { name: "ai_chat_memory", description: "History of interactions with Jerry." }
          ]
        });
      }
      if (name === "analyze_youtube_channel") {
        try {
          const r = await fetch(args.url, { headers: { "User-Agent": "Mozilla/5.0" } });
          const html = await r.text();
          const title = (html.match(/<meta property="og:title" content="([^"]+)"/) || [])[1] || "";
          const videoTitles = [...html.matchAll(/"title":\{"runs":\[\{"text":"([^"]+)"/g)].slice(0, 10).map(m => m[1]);
          return JSON.stringify({ url: args.url, channel_title: title, recent_video_titles: videoTitles });
        } catch (e) {
          return JSON.stringify({ error: String(e) });
        }
      }
      if (name === "get_recent_ideas") {
        const { data } = await supabase.from("raw_content").select("*").order("created_at", { ascending: false }).limit(5);
        return JSON.stringify(data);
      }
      if (name === "approve_idea") {
        const { error } = await supabase.from("raw_content").update({ status: 'approved' }).eq("id", args.id);
        return JSON.stringify({ success: !error, error: error?.message });
      }
      if (name === "reject_idea") {
        const { error } = await supabase.from("raw_content").update({ status: 'rejected' }).eq("id", args.id);
        return JSON.stringify({ success: !error, error: error?.message });
      }
      if (name === "get_scripts") {
        const { data } = await supabase.from("scripts").select("id, title, created_at").order("created_at", { ascending: false }).limit(10);
        return JSON.stringify(data);
      }
      if (name === "save_app_note") {
        const { error } = await supabase.from("ai_chat_memory").insert([{ role: "system", content: args.content, category: "note", metadata: { title: args.title } }]);
        return JSON.stringify({ success: !error, error: error?.message });
      }
      if (name === "clear_chat_memory") {
        const { error } = await supabase.from("ai_chat_memory").delete().neq("id", "00000000-0000-0000-0000-000000000000");
        return JSON.stringify({ success: !error, error: error?.message });
      }
      if (name === "web_search") {
        try {
          const q = encodeURIComponent(args.query);
          const r = await fetch(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`);
          const j = await r.json();
          return JSON.stringify({ query: args.query, abstract: j.AbstractText, related: (j.RelatedTopics || []).slice(0, 5).map((t: any) => t.Text) });
        } catch (e) {
          return JSON.stringify({ error: String(e) });
        }
      }
      if (name === "fetch_url") {
        try {
          const r = await fetch(args.url, { headers: { "User-Agent": "Mozilla/5.0" } });
          const text = (await r.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000);
          return JSON.stringify({ url: args.url, content: text });
        } catch (e) {
          return JSON.stringify({ error: String(e) });
        }
      }
      if (name === "generate_image" || name === "edit_image") {
        // Delegate to the generate-thumbnail edge function so EVERY image generated
        // by Jerry is auto-saved to thumbnail_library (Sky Style Library) AND uses
        // the past Sky thumbnails as visual style references.
        try {
          const payload: any = {
            prompt: args.prompt,
            model: args.model || "openai/gpt-image-2",
            size: args.size || "1792x1024",
            source: "jerry_chat",
          };
          if (args.lines) payload.lines = args.lines;
          if (name === "edit_image") payload.edit_image_url = args.image_url;

          const r = await fetch(`${supabaseUrl}/functions/v1/generate-thumbnail`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify(payload),
          });
          const j = await r.json();
          if (j.error) return JSON.stringify({ error: j.error });
          return JSON.stringify({ success: true, url: j.url, model: j.model, refs_used: j.refs_used, archived_in: "thumbnail_library" });
        } catch (e) {
          return JSON.stringify({ error: String(e) });
        }
      }
      if (name === "get_sky_thumbnail_refs") {
        const limit = Math.min(Math.max(Number(args.limit) || 6, 1), 20);
        const { data } = await supabase
          .from("thumbnail_library")
          .select("id, url, prompt, lines, model, created_at")
          .eq("is_sky_style", true)
          .order("created_at", { ascending: false })
          .limit(limit);
        return JSON.stringify({ count: data?.length || 0, refs: data || [] });
      }
      if (name === "list_training_docs") {
        const KEYS = ["training:transcript_1", "training:transcript_2", "training:sky_dna_general", "training:sky_dna_subjective"];
        const { data } = await supabase.from("app_settings").select("key, updated_at").in("key", KEYS);
        return JSON.stringify(data);
      }
      if (name === "get_training_doc") {
        const { data } = await supabase.from("app_settings").select("key, value").eq("key", args.key).maybeSingle();
        return JSON.stringify(data);
      }
      if (name === "update_training_doc") {
        const payload = { key: args.key, value: { text: args.content, edited_by: "jerry", edited_at: new Date().toISOString() }, updated_at: new Date().toISOString() };
        const { error } = await supabase.from("app_settings").upsert(payload, { onConflict: 'key' });
        return JSON.stringify({ success: !error, error: error?.message });
      }

      return "Tool not found";
    };

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

    const tools = [
      { type: "function", function: { name: "get_sources", description: "Get monitored YouTube channels." } },
      { type: "function", function: { name: "add_source", description: "Add a YouTube channel.", parameters: { type: "object", properties: { name: { type: "string" }, url: { type: "string" } }, required: ["name", "url"] } } },
      { type: "function", function: { name: "remove_source", description: "Remove a source.", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } },
      { type: "function", function: { name: "get_recent_ideas", description: "Retrieve recent video ideas." } },
      { type: "function", function: { name: "approve_idea", description: "Approve a video idea.", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } },
      { type: "function", function: { name: "reject_idea", description: "Reject a video idea.", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } },
      { type: "function", function: { name: "get_app_activity", description: "Status report of pipeline activity." } },
      { type: "function", function: { name: "get_app_biography", description: "Fetch the app's biography and neural scheme." } },
      { type: "function", function: { name: "read_ui_spec", description: "Read the UI specification documentation." } },
      { type: "function", function: { name: "get_table_schema", description: "Get database table descriptions." } },
      { type: "function", function: { name: "analyze_youtube_channel", description: "Analyze a channel.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
      { type: "function", function: { name: "web_search", description: "Search the internet.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
      { type: "function", function: { name: "fetch_url", description: "Fetch page content.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
      { type: "function", function: { name: "save_app_note", description: "Save a note.", parameters: { type: "object", properties: { title: { type: "string" }, content: { type: "string" } }, required: ["title", "content"] } } },
      { type: "function", function: { name: "list_training_docs", description: "List training docs." } },
      { type: "function", function: { name: "get_training_doc", description: "Read a training doc.", parameters: { type: "object", properties: { key: { type: "string" } }, required: ["key"] } } },
      { type: "function", function: { name: "update_training_doc", description: "Update a training doc.", parameters: { type: "object", properties: { key: { type: "string" }, content: { type: "string" } }, required: ["key", "content"] } } },
      { type: "function", function: { name: "generate_image", description: "Generate an image from a text prompt. Returns a public URL.", parameters: { type: "object", properties: { prompt: { type: "string", description: "Detailed image description" }, model: { type: "string", description: "openai/gpt-image-2 | openai/gpt-image-1 | openai/gpt-image-1-mini | openai/dall-e-3 | google/gemini-3-pro-image-preview | google/gemini-3.1-flash-image-preview | google/gemini-2.5-flash-image", enum: ["openai/gpt-image-2","openai/gpt-image-1","openai/gpt-image-1-mini","openai/dall-e-3","google/gemini-3-pro-image-preview","google/gemini-3.1-flash-image-preview","google/gemini-2.5-flash-image"] }, size: { type: "string", description: "e.g. 1024x1024, 1792x1024 (16:9 thumbnail), 1024x1792" } }, required: ["prompt"] } } },
      { type: "function", function: { name: "edit_image", description: "Modify an existing image given its URL and a change prompt. Returns a new public URL.", parameters: { type: "object", properties: { image_url: { type: "string" }, prompt: { type: "string" }, model: { type: "string", enum: ["openai/gpt-image-2","openai/gpt-image-1","google/gemini-3-pro-image-preview","google/gemini-3.1-flash-image-preview","google/gemini-2.5-flash-image"] } }, required: ["image_url", "prompt"] } } },
      { type: "function", function: { name: "get_sky_thumbnail_refs", description: "MUST CALL before generating any thumbnail. Returns past Sky Studio thumbnails (url, prompt, lines) from the permanent thumbnail_library to use as style reference.", parameters: { type: "object", properties: { limit: { type: "number", description: "How many recent thumbnails to fetch (default 6, max 20)" } } } } }
    ];

    const apiUrl = "https://api.openai.com/v1/chat/completions";
    const requestBody = {
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      tools,
      tool_choice: "auto",
    };

    let response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody),
    });

    let responseData = await response.json();
    if (responseData.error) throw new Error(responseData.error.message);
    
    let message = responseData.choices[0].message;

    while (message.tool_calls) {
      const toolResults = await Promise.all(
        message.tool_calls.map(async (toolCall: any) => {
          const result = await handleToolCall(toolCall);
          return { tool_call_id: toolCall.id, role: "tool", name: toolCall.function.name, content: result };
        })
      );

      const nextResponse = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: systemPrompt }, ...messages, message, ...toolResults],
          tools,
        }),
      });

      const nextData = await nextResponse.json();
      if (nextData.error) throw new Error(nextData.error.message);
      message = nextData.choices[0].message;
    }

    // Save history (fire-and-forget)
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg && lastUserMsg.role === "user") {
      const saveToMemory = async () => {
        await supabase.from("ai_chat_memory").insert([
          { role: "user", content: lastUserMsg.content, session_id: session_id },
          { role: "assistant", content: message.content, session_id: session_id }
        ]);
      };
      // @ts-ignore: EdgeRuntime is available in Supabase
      if (typeof EdgeRuntime !== 'undefined') { EdgeRuntime.waitUntil(saveToMemory()); } else { saveToMemory(); }
    }

    return new Response(JSON.stringify(message), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

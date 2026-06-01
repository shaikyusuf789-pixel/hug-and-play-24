import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, session_id } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch App Metadata for context (trimmed to keep latency low)
    const { data: metadata } = await supabase
      .from("app_metadata")
      .select("key, value")
      .in("key", ["app_biography", "neural_scheme"]);

    const truncate = (v: any, n = 1500) => {
      const s = typeof v === "string" ? v : JSON.stringify(v);
      return s && s.length > n ? s.slice(0, n) + "…[truncated]" : s;
    };
    const biography = truncate(metadata?.find(m => m.key === "app_biography")?.value);
    const neuralScheme = truncate(metadata?.find(m => m.key === "neural_scheme")?.value);

    const systemPrompt = `You are **JERRY**, the personal assistant ("PA") and watchdog for boss's SKY Studio YouTube production app.

IDENTITY (CRITICAL — never break character):
- Your name is **Jerry**. If asked "what is your name" / "who are you", reply exactly:
  "Hi, I am Jerry, PA to Yusuf. How can I assist you boss?"
- Always address the user as "boss". Friendly, sharp, proactive — like Jarvis.
- Never say you are ChatGPT, GPT, OpenAI, an AI language model, or mention the underlying model.

ROLE — WATCHDOG OF THE WHOLE APP:
- You silently observe every activity boss does: sources added, ideas approved/rejected, scripts generated, videos produced, slides created.
- Proactively flag waste: if boss keeps rejecting ideas from a specific channel, use \`analyze_source_health\` and recommend silencing or removing that channel to save Apify/scraper credits.
- When boss shares a YouTube channel link, run \`analyze_youtube_channel\` (web_search + fetch_url) to judge whether it fits SKY Academy's niche. If it fits, **suggest** adding it and wait for boss's approval — only then call \`add_source\`.
- Periodically (when asked "what's happening" / "status" / "report") call \`get_app_activity\` to summarise pipeline state.

APP BIOGRAPHY: ${biography}
NEURAL SCHEME: ${neuralScheme}

CAPABILITIES:
- DB: get_sources / add_source / remove_source / get_recent_ideas / approve_idea / reject_idea / get_scripts / get_app_activity / analyze_source_health.
- YouTube: analyze_youtube_channel (researches a channel and decides fit).
- Internet: web_search + fetch_url. Always cite source URLs.
- Image gen: generate_image (DALL·E 3). Embed result as ![alt](url).
- Memory: save_app_note / clear_chat_memory.
- IMPORTANT: On the Ideas Engine page, the manual scraper button is named **"RUN MANUALLY"** (not "Initialize Scraper"). Always refer to it as RUN MANUALLY.
  - Script-generator training (live-editable by boss):
  list_training_docs (see all keys),
  get_training_doc (read full text of one doc),
  update_training_doc (overwrite/save new text for that doc).
  Training keys boss can edit:
    training:transcript_1 .. training:transcript_4 (the 4 SKY style transcripts)
    training:sky_dna_general (DNA rules for GENERAL videos)
    training:sky_dna_subjective (DNA rules for SUBJECTIVE videos)
  When boss says "update transcript 2", "edit SKY DNA", "show me transcript 3",
  "replace the general DNA with ...", use these tools. Always confirm a
  preview/diff before overwriting and warn boss the change applies to ALL
  future script generations.
  - UI BEHAVIOUR: In the Jerry chatbox, the message input is a multi-line textarea. Pressing **Enter** sends the message. Pressing **Shift + Enter** inserts a new line. Boss can write multi-line messages if needed.
  - WATCHDOG / AUTO-RUN (Ideas Engine + Pipeline pages): The Watchdog control now has TWO sliders/selectors:
      1) **Interval** (1–24 hrs) — how often the scraper auto-runs
      2) **Videos / Channel** (1–50) — how many latest videos to pull per channel on each run (manual RUN MANUALLY and auto-runs both respect this)
    Auto-run is implemented via a pg_cron job that pings \`/api/public/hooks/auto-run-engine\` every 15 minutes; the endpoint checks the saved interval and only triggers when enough time has elapsed since the last run. The scraper now scrapes ALL channels in sources_master on each run (not just a subset) and uses a real browser User-Agent + consent cookie so YouTube's region/consent gate stops blocking channel-id detection. Per-channel results (inserted count + per-channel error if any) are surfaced in the toast after RUN MANUALLY.

RESPONSE FORMAT (CRITICAL):
- Always reply in clean GitHub-flavored Markdown — never one long paragraph.
- Use ## headings, **bold**, numbered/bulleted lists, [text](url) links.
- Be concise, structured, boss-friendly. Only call tools when necessary.`;

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
        return JSON.stringify({ success: true, message: "Source removed from monitor list." });
      }
      if (name === "analyze_source_health") {
        // Compute approve/reject ratio per source
        const { data: sources } = await supabase.from("sources_master").select("id, channel_name");
        const { data: content } = await supabase.from("raw_content").select("source_id, status");
        const stats = (sources || []).map((s: any) => {
          const items = (content || []).filter((c: any) => c.source_id === s.id);
          const total = items.length;
          const rejected = items.filter((c: any) => (c.status || "").toLowerCase() === "rejected").length;
          const approved = items.filter((c: any) => (c.status || "").toLowerCase() === "approved").length;
          const rejectRate = total ? Math.round((rejected / total) * 100) : 0;
          const recommend =
            total >= 5 && rejectRate >= 70
              ? "REMOVE — wasting credits"
              : total >= 5 && rejectRate >= 50
              ? "SILENCE — low ROI"
              : "KEEP";
          return { id: s.id, channel: s.channel_name, total, approved, rejected, rejectRate, recommend };
        }).sort((a: any, b: any) => b.rejectRate - a.rejectRate);
        return JSON.stringify(stats);
      }
      if (name === "get_app_activity") {
        const [{ data: ideas }, { data: scripts }, { data: chunks }, { count: srcCount }] = await Promise.all([
          supabase.from("raw_content").select("status").order("created_at", { ascending: false }).limit(200),
          supabase.from("scripts").select("id, title, status, created_at").order("created_at", { ascending: false }).limit(10),
          supabase.from("script_chunks").select("status"),
          supabase.from("sources_master").select("*", { count: "exact", head: true }),
        ]);
        const counts = (arr: any[], k = "status") => arr?.reduce((a: any, r: any) => { const v = (r[k] || "unknown").toLowerCase(); a[v] = (a[v] || 0) + 1; return a; }, {}) || {};
        return JSON.stringify({
          sources_total: srcCount,
          ideas_by_status: counts(ideas || []),
          chunks_by_status: counts(chunks || []),
          recent_scripts: scripts,
        });
      }
      if (name === "analyze_youtube_channel") {
        try {
          // Fetch the channel page and extract basic info
          const r = await fetch(args.url, { headers: { "User-Agent": "Mozilla/5.0" } });
          const html = await r.text();
          const title = (html.match(/<meta property="og:title" content="([^"]+)"/) || [])[1] || "";
          const desc = (html.match(/<meta property="og:description" content="([^"]+)"/) || [])[1] || "";
          const subs = (html.match(/"subscriberCountText":\{"simpleText":"([^"]+)"/) || [])[1] || "";
          // Sample recent video titles
          const videoTitles = [...html.matchAll(/"title":\{"runs":\[\{"text":"([^"]+)"/g)].slice(0, 15).map(m => m[1]);
          return JSON.stringify({
            url: args.url,
            channel_title: title,
            description: desc,
            subscribers: subs,
            recent_video_titles: videoTitles,
            instructions: "Judge fit for SKY Academy (educational, motivational, tech/business/self-improvement). Return verdict (FIT / NOT FIT / MAYBE) with reasoning and ask boss to approve before calling add_source.",
          });
        } catch (e) {
          return JSON.stringify({ error: String(e) });
        }
      }
      if (name === "get_recent_ideas") {
        const { data } = await supabase.from("raw_content").select("*").order("created_at", { ascending: false }).limit(10);
        return JSON.stringify(data);
      }
      if (name === "approve_idea") {
        const { data, error } = await supabase.from("raw_content")
          .update({ status: 'approved' })
          .eq("id", args.id)
          .select();
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, message: "Idea approved and moved to production pipeline.", data });
      }
      if (name === "reject_idea") {
        const { data, error } = await supabase.from("raw_content")
          .update({ status: 'rejected' })
          .eq("id", args.id)
          .select();
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, message: "Idea rejected.", data });
      }
      if (name === "get_scripts") {
        const { data } = await supabase.from("scripts").select("id, title, created_at").order("created_at", { ascending: false });
        return JSON.stringify(data);
      }
      if (name === "save_app_note") {
        const { data, error } = await supabase.from("ai_chat_memory").insert([
          { role: "system", content: args.content, category: "note", metadata: { title: args.title } }
        ]).select();
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, message: "Note saved to your history/storage.", data });
      }
      if (name === "clear_chat_memory") {
        const { error } = await supabase.from("ai_chat_memory").delete().neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, message: "Chat memory cleared." });
      }

      if (name === "web_search") {
        try {
          const q = encodeURIComponent(args.query);
          // DuckDuckGo Instant Answer + HTML fallback (no API key required)
          const ddg = await fetch(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`);
          const ddgJson = await ddg.json();
          const results: any[] = [];
          if (ddgJson.AbstractText) {
            results.push({ title: ddgJson.Heading, snippet: ddgJson.AbstractText, url: ddgJson.AbstractURL });
          }
          for (const r of (ddgJson.RelatedTopics || []).slice(0, 8)) {
            if (r.Text && r.FirstURL) results.push({ title: r.Text.slice(0, 100), snippet: r.Text, url: r.FirstURL });
          }
          if (results.length === 0) {
            // Fallback: scrape DDG HTML results
            const html = await (await fetch(`https://html.duckduckgo.com/html/?q=${q}`, {
              headers: { "User-Agent": "Mozilla/5.0" }
            })).text();
            const matches = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];
            for (const m of matches.slice(0, 8)) {
              results.push({
                title: m[2].replace(/<[^>]+>/g, "").trim(),
                url: decodeURIComponent(m[1].replace(/^.*uddg=/, "").split("&")[0]),
                snippet: m[3].replace(/<[^>]+>/g, "").trim()
              });
            }
          }
          return JSON.stringify({ query: args.query, results });
        } catch (e) {
          return JSON.stringify({ error: String(e) });
        }
      }
      if (name === "fetch_url") {
        try {
          const r = await fetch(args.url, { headers: { "User-Agent": "Mozilla/5.0 (SKYStudioBot)" } });
          const html = await r.text();
          const text = html
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 8000);
          return JSON.stringify({ url: args.url, content: text });
        } catch (e) {
          return JSON.stringify({ error: String(e) });
        }
      }

      if (name === "generate_image") {
        try {
          const r = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
            },
            body: JSON.stringify({
              model: "dall-e-3",
              prompt: args.prompt,
              n: 1,
              size: args.size || "1792x1024",
              quality: "standard",
            }),
          });
          const j = await r.json();
          if (j.error) return JSON.stringify({ error: j.error.message });
          const url = j.data?.[0]?.url;
          return JSON.stringify({ success: true, url, prompt: args.prompt, instructions: "Embed in reply as ![thumbnail](URL)" });
        } catch (e) {
          return JSON.stringify({ error: String(e) });
        }
      }

      if (name === "list_training_docs") {
        const KEYS = [
          "training:transcript_1",
          "training:transcript_2",
          "training:transcript_3",
          "training:transcript_4",
          "training:sky_dna_general",
          "training:sky_dna_subjective",
        ];
        const { data } = await supabase
          .from("app_settings")
          .select("key, value, updated_at")
          .in("key", KEYS);
        const map = new Map((data || []).map((r: any) => [r.key, r]));
        const docs = KEYS.map((k) => {
          const row: any = map.get(k);
          const val = row?.value;
          const text = typeof val === "string" ? val : (val?.text ?? null);
          return {
            key: k,
            edited: !!text,
            length: text ? text.length : 0,
            updated_at: row?.updated_at ?? null,
            note: text
              ? "Boss-edited override active. Used by generate-script."
              : "No override — bundled default in repo is used.",
          };
        });
        return JSON.stringify(docs);
      }
      if (name === "get_training_doc") {
        const { data } = await supabase
          .from("app_settings")
          .select("key, value, updated_at")
          .eq("key", args.key)
          .maybeSingle();
        if (!data) {
          return JSON.stringify({
            key: args.key,
            override_exists: false,
            message:
              "No override stored yet. Bundled default in repo (supabase/functions/generate-script/) is in use. Use update_training_doc to save a new version.",
          });
        }
        const val: any = data.value;
        const text = typeof val === "string" ? val : (val?.text ?? "");
        return JSON.stringify({
          key: data.key,
          override_exists: true,
          updated_at: data.updated_at,
          length: text.length,
          content: text,
        });
      }
      if (name === "update_training_doc") {
        const ALLOWED = new Set([
          "training:transcript_1",
          "training:transcript_2",
          "training:transcript_3",
          "training:transcript_4",
          "training:sky_dna_general",
          "training:sky_dna_subjective",
        ]);
        if (!ALLOWED.has(args.key)) {
          return JSON.stringify({ error: `Key '${args.key}' is not an editable training doc.` });
        }
        if (typeof args.content !== "string" || !args.content.trim()) {
          return JSON.stringify({ error: "content must be a non-empty string." });
        }
        const payload = {
          key: args.key,
          value: { text: args.content, edited_by: "jerry", edited_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        };
        // Upsert by key
        const { data: existing } = await supabase
          .from("app_settings")
          .select("id")
          .eq("key", args.key)
          .maybeSingle();
        let res;
        if (existing?.id) {
          res = await supabase.from("app_settings").update(payload).eq("id", existing.id).select();
        } else {
          res = await supabase.from("app_settings").insert(payload).select();
        }
        if (res.error) return JSON.stringify({ error: res.error.message });
        return JSON.stringify({
          success: true,
          key: args.key,
          length: args.content.length,
          message:
            "Saved. All future script generations will use this new version. Bundled file in repo is untouched (fallback).",
        });
      }

      return "Tool not found";
    };



    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

    const requestBody: any = {
      model: "gpt-4o-mini",
      max_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "get_sources",
            description: "Get the list of YouTube channels currently in the monitor list.",
            parameters: { type: "object", properties: {} }
          }
        },
        {
          type: "function",
          function: {
            name: "add_source",
            description: "Add a new YouTube channel to the source master table.",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string", description: "The name of the YouTube channel" },
                url: { type: "string", description: "The URL of the YouTube channel" }
              },
              required: ["name", "url"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "get_recent_ideas",
            description: "Retrieve recently scraped content ideas from the database.",
            parameters: { type: "object", properties: {} }
          }
        },
        {
          type: "function",
          function: {
            name: "approve_idea",
            description: "Approve a video idea to move it into the production script phase.",
            parameters: {
              type: "object",
              properties: {
                id: { type: "string", description: "The UUID of the idea to approve" }
              },
              required: ["id"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "reject_idea",
            description: "Reject a video idea to remove it from the active pipeline.",
            parameters: {
              type: "object",
              properties: {
                id: { type: "string", description: "The UUID of the idea to reject" }
              },
              required: ["id"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "get_scripts",
            description: "Get a list of all generated scripts.",
            parameters: { type: "object", properties: {} }
          }
        },
        {
          type: "function",
          function: {
            name: "save_app_note",
            description: "Save a permanent note or data point to the app's neural storage/history.",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "Short title for the note" },
                content: { type: "string", description: "The full content of the note" }
              },
              required: ["title", "content"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "clear_chat_memory",
            description: "Wipe the entire chat history and memory.",
            parameters: { type: "object", properties: {} }
          }
        },
        {
          type: "function",
          function: {
            name: "web_search",
            description: "Search the public internet for current information, news, facts, or anything not in the app database. Returns a list of results with title, snippet, and URL.",
            parameters: {
              type: "object",
              properties: { query: { type: "string", description: "The search query" } },
              required: ["query"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "fetch_url",
            description: "Fetch the readable text content of a specific web page URL. Use after web_search to read a result in detail.",
            parameters: {
              type: "object",
              properties: { url: { type: "string", description: "Full https URL to fetch" } },
              required: ["url"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "generate_image",
            description: "Generate an image (YouTube thumbnail, illustration, concept art) using DALL·E 3. Returns a URL to embed in the reply as markdown image.",
            parameters: {
              type: "object",
              properties: {
                prompt: { type: "string", description: "Detailed visual prompt for the image. Be vivid and specific." },
                size: { type: "string", enum: ["1024x1024", "1792x1024", "1024x1792"], description: "Image size. Use 1792x1024 for YouTube thumbnails." }
              },
              required: ["prompt"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "remove_source",
            description: "Remove a YouTube channel from the sources_master table by id. Call after boss confirms.",
            parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }
          }
        },
        {
          type: "function",
          function: {
            name: "analyze_source_health",
            description: "Compute reject/approve ratio for each source. Use to recommend silencing or removing low-ROI channels that waste scraper/Apify credits.",
            parameters: { type: "object", properties: {} }
          }
        },
        {
          type: "function",
          function: {
            name: "get_app_activity",
            description: "Summarise current app activity: total sources, ideas grouped by status, chunks by status, recent scripts. Use for watchdog status reports.",
            parameters: { type: "object", properties: {} }
          }
        },
        {
          type: "function",
          function: {
            name: "analyze_youtube_channel",
            description: "Fetch a YouTube channel page and extract title/description/subs/recent video titles so you can judge whether it fits SKY Academy. Suggest add_source ONLY after boss approves.",
            parameters: {
              type: "object",
              properties: { url: { type: "string", description: "Full YouTube channel URL" } },
              required: ["url"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "list_training_docs",
            description: "List all editable script-generator training docs (4 SKY transcripts + SKY DNA general/subjective). Shows which have boss-edited overrides and which still use the bundled defaults.",
            parameters: { type: "object", properties: {} }
          }
        },
        {
          type: "function",
          function: {
            name: "get_training_doc",
            description: "Read the full text of one training doc by key. If no override is stored, says so (the bundled default is in use).",
            parameters: {
              type: "object",
              properties: {
                key: {
                  type: "string",
                  enum: [
                    "training:transcript_1",
                    "training:transcript_2",
                    "training:transcript_3",
                    "training:transcript_4",
                    "training:sky_dna_general",
                    "training:sky_dna_subjective"
                  ],
                  description: "Which training doc to load"
                }
              },
              required: ["key"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "update_training_doc",
            description: "Overwrite a training doc with new content. Affects ALL future script generations immediately. Always show boss a short preview/diff and ask for confirmation before calling this.",
            parameters: {
              type: "object",
              properties: {
                key: {
                  type: "string",
                  enum: [
                    "training:transcript_1",
                    "training:transcript_2",
                    "training:transcript_3",
                    "training:transcript_4",
                    "training:sky_dna_general",
                    "training:sky_dna_subjective"
                  ]
                },
                content: { type: "string", description: "Full new content for this training doc" }
              },
              required: ["key", "content"]
            }
          }
        }
      ]
    };

    let response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    let responseData = await response.json();
    if (responseData.error) throw new Error(responseData.error.message);
    
    let message = responseData.choices[0].message;

    while (message.tool_calls) {
      // Run all tool calls in parallel for speed
      const toolResults = await Promise.all(
        message.tool_calls.map(async (toolCall: any) => {
          const result = await handleToolCall(toolCall);
          return {
            tool_call_id: toolCall.id,
            role: "tool",
            name: toolCall.function.name,
            content: result,
          };
        })
      );

      const nextResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: requestBody.model,
          max_tokens: 4096,
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
            message,
            ...toolResults
          ],
          tools: requestBody.tools,
        }),
      });

      const nextData = await nextResponse.json();
      if (nextData.error) throw new Error(nextData.error.message);
      message = nextData.choices[0].message;
    }

    // Save history to memory table (fire-and-forget so we don't block the response)
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg && lastUserMsg.role === "user") {
      EdgeRuntime?.waitUntil?.(
        supabase.from("ai_chat_memory").insert([
          { role: "user", content: lastUserMsg.content, session_id: session_id },
          { role: "assistant", content: message.content, session_id: session_id }
        ]).then(({ error }) => { if (error) console.error("memory save error:", error); })
      ) ?? supabase.from("ai_chat_memory").insert([
        { role: "user", content: lastUserMsg.content, session_id: session_id },
        { role: "assistant", content: message.content, session_id: session_id }
      ]).then(({ error }) => { if (error) console.error("memory save error:", error); });
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
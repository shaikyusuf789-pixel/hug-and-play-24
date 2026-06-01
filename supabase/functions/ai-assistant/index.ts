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

    // Fetch App Metadata for context
    const { data: metadata } = await supabase
      .from("app_metadata")
      .select("key, value");

    const biography = metadata?.find(m => m.key === "app_biography")?.value;
    const neuralScheme = metadata?.find(m => m.key === "neural_scheme")?.value;

    const systemPrompt = `You are the SKY Studio AI Assistant, the "Second Brain" of this YouTube production pipeline.
You have absolute knowledge of the app's biography, neural scheme, and data structures.

APP BIOGRAPHY:
${JSON.stringify(biography, null, 2)}

NEURAL SCHEME:
${JSON.stringify(neuralScheme, null, 2)}

YOUR MISSION:
1. Act as a second brain. You know every button, every page, and every table.
2. Provide answers based on the current state of the app.
3. You have READ and WRITE access to the database using the tools provided.
4. Help the user manage their pipeline by approving ideas, adding sources, and cleaning up scripts.
5. If a user asks to "store" something, use 'save_app_note'.
6. If they ask to clear history, use 'clear_chat_memory'.

7. You have INTERNET ACCESS via 'web_search' (search the web) and 'fetch_url' (fetch a specific page's text). Use them to fact-check scripts/ideas, pull news updates, verify claims, or look up anything the user asks. Always cite the source URLs in your reply.

8. You can GENERATE IMAGES (thumbnails, illustrations, concept art) using 'generate_image' (DALL·E 3). When the user asks for a thumbnail or image, call this tool with a vivid descriptive prompt and then embed the returned URL in markdown: ![alt](url).

RESPONSE FORMATTING (CRITICAL):
- Always reply in clean GitHub-flavored Markdown.
- Use ## headings, **bold**, numbered lists, and bullet points. Never reply as a single long paragraph.
- For lists of items (channels, ideas, sources), use numbered lists where each item has its own line with bolded title, then sub-bullets for Description / Link / Source.
- Keep links as proper [Title](url) markdown.

Always be professional, concise, and incredibly helpful.`;

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
      const toolResults = [];
      for (const toolCall of message.tool_calls) {
        const result = await handleToolCall(toolCall);
        toolResults.push({
          tool_call_id: toolCall.id,
          role: "tool",
          name: toolCall.function.name,
          content: result
        });
      }

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

    // Save history to memory table
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg && lastUserMsg.role === "user") {
      await supabase.from("ai_chat_memory").insert([
        { role: "user", content: lastUserMsg.content, session_id: session_id },
        { role: "assistant", content: message.content, session_id: session_id }
      ]);
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
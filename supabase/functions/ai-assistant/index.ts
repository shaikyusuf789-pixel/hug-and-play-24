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
    const { messages } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch App Metadata
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
3. You can read and write data using the tools provided.
4. When a user asks to add a source, use 'add_source'.
5. When they ask about ideas, use 'get_recent_ideas'.
6. When they ask about scripts, use 'get_script_by_title'.

Always be professional, concise, and incredibly helpful.`;

    const handleToolCall = async (call: any) => {
      const { name, arguments: argsJson } = call.function;
      const args = JSON.parse(argsJson);
      
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
        const { data } = await supabase.from("raw_content").select("*").order("created_at", { ascending: false }).limit(5);
        return JSON.stringify(data);
      }
      if (name === "get_script_by_title") {
        const { data } = await supabase.from("scripts").select("*").ilike("title", `%${args.title}%`).limit(1);
        return JSON.stringify(data);
      }
      return "Tool not found";
    };

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

    const requestBody = {
      model: "gpt-4o-mini",
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
            name: "get_script_by_title",
            description: "Search for an existing script by its title.",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "The title or keyword of the script" }
              },
              required: ["title"]
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

    let data = await response.json();
    let message = data.choices[0].message;

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
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
            message,
            ...toolResults
          ]
        }),
      });

      const nextData = await nextResponse.json();
      message = nextData.choices[0].message;
    }

    // Save history
    const lastUserMsg = messages[messages.length - 1];
    await supabase.from("ai_chat_memory").insert([
      { role: "user", content: lastUserMsg.content },
      { role: "assistant", content: message.content }
    ]);

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

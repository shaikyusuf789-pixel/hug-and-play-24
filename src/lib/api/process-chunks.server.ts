import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

export const processChunks = createServerFn({ method: "POST" })
  .inputValidator(z.object({ scriptContent: z.string() }))
  .handler(async ({ data: { scriptContent } }) => {
    console.log("Splitting chunks via Edge Function...");
    
    const { data, error } = await supabaseAdmin.functions.invoke("process-chunks", {
      body: { scriptContent }
    });

    if (error) throw error;
    return data;
  });


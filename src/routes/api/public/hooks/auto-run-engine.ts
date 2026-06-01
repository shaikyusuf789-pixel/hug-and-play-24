import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// pg_cron pings this every ~15 minutes. We check the saved interval and
// only trigger a real run when enough time has passed since last_run.
export const Route = createFileRoute("/api/public/hooks/auto-run-engine")({
  server: {
    handlers: {
      POST: async () => {
        const { data: row } = await supabaseAdmin
          .from("app_settings")
          .select("value")
          .eq("key", "engine_auto_run")
          .maybeSingle();

        const cfg = (row?.value || {}) as {
          enabled?: boolean;
          interval_hrs?: number;
          videos_per_run?: number;
          last_run?: string | null;
        };

        if (!cfg.enabled) {
          return Response.json({ ok: true, skipped: "disabled" });
        }

        const intervalMs = Math.max(1, cfg.interval_hrs ?? 1) * 60 * 60 * 1000;
        const lastRunMs = cfg.last_run ? new Date(cfg.last_run).getTime() : 0;
        const now = Date.now();

        if (lastRunMs && now - lastRunMs < intervalMs - 60_000) {
          const nextIn = Math.round((intervalMs - (now - lastRunMs)) / 60_000);
          return Response.json({ ok: true, skipped: "interval-not-elapsed", next_run_in_min: nextIn });
        }

        // Mark last_run BEFORE invoking the heavy work so concurrent cron ticks don't double-fire
        await supabaseAdmin
          .from("app_settings")
          .upsert(
            { key: "engine_auto_run", value: { ...cfg, last_run: new Date().toISOString() } },
            { onConflict: "key" },
          );

        const { runIdeaEngineCore } = await import("@/lib/engine.functions");
        const videosLimit = cfg.videos_per_run ?? 10;

        try {
          const result = await runIdeaEngineCore({ videosLimit });
          return Response.json({ ok: true, ran: true, result });
        } catch (err: any) {
          console.error("[auto-run-engine] failed:", err);
          return Response.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
        }
      },
    },
  },
});

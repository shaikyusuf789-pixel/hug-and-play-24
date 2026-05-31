import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { runIdeaEngine, updateLastRunTimestamp } from "@/lib/engine.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Play, Radio, ListVideo, CheckCircle2, Github, Table as TableIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { WatchdogControl } from "@/components/WatchdogControl";

export const Route = createFileRoute("/_dashboard/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Idea Engine — SKY Studio" }] }),
});

const DASHBOARD_TABLES = [
  "sources_master",
  "raw_content",
  "scripts",
  "user_uploads",
  "app_settings",
  "notifications",
  "daily_backup_logs",
  "script_chunks",
  "youtube_seo",
  "ai_chat_memory"
];

function Dashboard() {
  const qc = useQueryClient();
  
  const stats = useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      const [total, pending, approved, priority, scriptDone, audioDone] = await Promise.all([
        supabase.from("raw_content").select("*", { count: "exact", head: true }),
        supabase.from("raw_content").select("*", { count: "exact", head: true }).eq("status", "Pending"),
        supabase.from("raw_content").select("*", { count: "exact", head: true }).eq("status", "Approved"),
        supabase.from("raw_content").select("*", { count: "exact", head: true }).eq("status", "Priority"),
        supabase.from("raw_content").select("*", { count: "exact", head: true }).eq("status", "Script Done"),
        supabase.from("raw_content").select("*", { count: "exact", head: true }).eq("status", "Audio Done"),
      ]);
      return { 
        total: total.count ?? 0, 
        pending: pending.count ?? 0,
        approved: approved.count ?? 0,
        priority: priority.count ?? 0,
        scriptDone: scriptDone.count ?? 0,
        audioDone: audioDone.count ?? 0,
      };
    },
  });

  const runFn = useServerFn(runIdeaEngine);
  const setLastRun = useServerFn(updateLastRunTimestamp);
  
  const run = useMutation({
    mutationFn: () => runFn(),
    onSuccess: (res) => {
      toast.success(`Processed ${res.processed} new ideas.`);
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["ideas"] });
      setLastRun();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cards = [
    { label: "Total Ideas", value: stats.data?.total, icon: ListVideo, color: "text-indigo-400", gradient: "from-indigo-500/10 to-transparent" },
    { label: "Pending Approval", value: stats.data?.pending, icon: Radio, color: "text-amber-400", gradient: "from-amber-500/10 to-transparent" },
    { label: "Pending Priority", value: stats.data?.approved, icon: CheckCircle2, color: "text-cyan-400", gradient: "from-cyan-500/10 to-transparent" },
    { label: "Pending Scripting", value: stats.data?.priority, icon: Play, color: "text-violet-400", gradient: "from-violet-500/10 to-transparent" },
    { label: "Pending Audio", value: stats.data?.scriptDone, icon: Radio, color: "text-fuchsia-400", gradient: "from-fuchsia-500/10 to-transparent" },
    { label: "Pending Slides", value: stats.data?.audioDone, icon: ListVideo, color: "text-emerald-400", gradient: "from-emerald-500/10 to-transparent" },

  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8 p-4 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded uppercase tracking-wider">Phase 1</span>
            <span className="text-[10px] text-slate-400 font-medium tracking-wider">• COMPETITOR SCRAPER</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Idea Engine</h1>
          <p className="text-sm text-slate-400 mt-1 font-medium italic">Scrape competitor YouTube channels and generate fresh video ideas.</p>

        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <WatchdogControl />
          <Button onClick={() => run.mutate()} disabled={run.isPending} className="bg-indigo-600 hover:bg-indigo-500 shadow-xl shadow-indigo-500/20 h-11 px-8 gap-2 rounded-2xl w-full sm:w-auto font-bold uppercase tracking-widest text-[10px]">
            {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
            Run manually
          </Button>
          <Button 
            variant="outline"
            onClick={async () => {
              try {
                const { data, error } = await supabase.functions.invoke("run-engine", {
                  body: { sourceId: null },
                });






                if (error) throw error;
                toast.success("GitHub Backup triggered successfully!");
              } catch (e: any) {
                toast.error("Failed to trigger backup: " + e.message);
              }
            }}
            className="border-white/10 hover:bg-white/5 text-white h-11 px-6 gap-2 rounded-2xl w-full sm:w-auto font-bold uppercase tracking-widest text-[10px]"
          >

            <Github className="h-4 w-4" />
            Backup to GitHub
          </Button>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className={cn("rounded-3xl border border-white/5 shadow-2xl shadow-black/20 overflow-hidden bg-linear-to-br transition-all hover:scale-[1.02] duration-300 group", c.gradient)}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-transparent">
                <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-400/70 group-hover:text-white transition-colors">{c.label}</CardTitle>

                <Icon className={cn("h-4 w-4", c.color)} />
              </CardHeader>
              <CardContent className="pt-4 pb-6">
                <div className="text-4xl font-black text-white group-hover:scale-110 transition-transform origin-left">{c.value ?? "0"}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {DASHBOARD_TABLES.map((table) => (
          <Card key={table} className="rounded-2xl border-white/5 shadow-sm border p-4 bg-white/5 hover:bg-white/10 transition-all hover:-translate-y-1 cursor-pointer">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 truncate">
              {table.replace(/_/g, " ")}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-400">Active</span>
              <TableIcon className="h-3 w-3 text-slate-300" />
            </div>
          </Card>
        ))}
      </div>

      <Card className="rounded-[2.5rem] border-white/5 shadow-2xl shadow-black/40 overflow-hidden border bg-white/5 backdrop-blur-xl relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[100px] pointer-events-none" />
        <CardHeader className="p-8 border-b border-white/5 bg-white/5">
          <CardTitle className="text-xl font-black text-white tracking-tight">Workflow Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-8 grid md:grid-cols-2 gap-8 text-sm text-slate-400 relative z-10">

           <div className="space-y-4">
              <div className="flex gap-4">
                 <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0 font-black shadow-lg shadow-indigo-500/10 border border-indigo-500/20">1</div>
                 <p className="leading-relaxed"><strong className="text-white block font-bold mb-1">Configure Sources</strong>Add YouTube channels or keyword search terms to monitor for new content.</p>

              </div>
              <div className="flex gap-4">
                 <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0 font-black shadow-lg shadow-indigo-500/10 border border-indigo-500/20">2</div>
                 <p className="leading-relaxed"><strong className="text-white block font-bold mb-1">Automated Scraping</strong>The engine pulls transcripts and metadata from recent high-performing videos.</p>

              </div>
           </div>
           <div className="space-y-4">
              <div className="flex gap-4">
                 <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0 font-black shadow-lg shadow-indigo-500/10 border border-indigo-500/20">3</div>
                 <p className="leading-relaxed"><strong className="text-white block font-bold mb-1">AI Idea Generation</strong>Claude analyzes transcripts to propose new titles, hooks, and outlines tailored to your style.</p>

              </div>
              <div className="flex gap-4">
                 <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0 font-black shadow-lg shadow-indigo-500/10 border border-indigo-500/20">4</div>
                 <p className="leading-relaxed"><strong className="text-white block font-bold mb-1">One-Click Approval</strong>Move generated ideas to the Scripting phase with a single click from the Idea Cards view.</p>

              </div>
           </div>
        </CardContent>
      </Card>
    </div>
  );
}
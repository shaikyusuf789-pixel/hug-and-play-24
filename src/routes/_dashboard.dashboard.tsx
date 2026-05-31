import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { runIdeaEngine, updateLastRunTimestamp } from "@/lib/engine.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Play, Radio, ListVideo, CheckCircle2, Github, Table as TableIcon, Sparkles, BrainCircuit, Rocket } from "lucide-react";
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
    { label: "Total Ideas", value: stats.data?.total, icon: ListVideo, color: "text-indigo-400", gradient: "from-indigo-500/20 to-transparent" },
    { label: "Pending Approval", value: stats.data?.pending, icon: Radio, color: "text-amber-400", gradient: "from-amber-500/20 to-transparent" },
    { label: "Pending Priority", value: stats.data?.approved, icon: CheckCircle2, color: "text-cyan-400", gradient: "from-cyan-500/20 to-transparent" },
    { label: "Pending Scripting", value: stats.data?.priority, icon: Play, color: "text-violet-400", gradient: "from-violet-500/20 to-transparent" },
    { label: "Pending Audio", value: stats.data?.scriptDone, icon: Radio, color: "text-fuchsia-400", gradient: "from-fuchsia-500/20 to-transparent" },
    { label: "Pending Slides", value: stats.data?.audioDone, icon: ListVideo, color: "text-emerald-400", gradient: "from-emerald-500/20 to-transparent" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 sm:space-y-10 p-4 sm:p-8 relative min-h-full">
      {/* Dynamic Background Elements */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-indigo-600/[0.03] blur-[140px] pointer-events-none rounded-full" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-blue-600/[0.03] blur-[120px] pointer-events-none rounded-full" />

      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
        <div className="space-y-2">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[10px] font-black bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full uppercase tracking-[0.2em] border border-white/5 backdrop-blur-md">
              System Core v4.2
            </span>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">Active</span>
            </div>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-none">
            Sky <span className="text-indigo-500 italic">Studio</span>
          </h1>
          <p className="text-sm sm:text-base text-slate-400 font-medium max-w-xl">
            Autonomous AI Video Production Pipeline. <span className="text-indigo-400/80">Fueling SKY Academy's content engine.</span>
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4 bg-white/[0.02] p-2 rounded-[2rem] border border-white/5 backdrop-blur-xl">
          <WatchdogControl className="bg-transparent border-none shadow-none p-2" />
          <div className="flex gap-2">
            <Button 
              onClick={() => run.mutate()} 
              disabled={run.isPending} 
              className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-2xl shadow-indigo-500/40 h-12 px-8 gap-3 rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all hover:scale-105 active:scale-95"
            >
              {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4 fill-white/20" />}
              Initialize Scraper
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
              className="border-white/10 bg-white/5 hover:bg-white/10 text-white h-12 px-6 gap-3 rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all"
            >
              <Github className="h-4 w-4" />
              Backup
            </Button>
          </div>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 relative z-10">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="rounded-[2.5rem] border border-white/5 shadow-2xl shadow-black/60 overflow-hidden bg-slate-900/40 backdrop-blur-xl transition-all hover:scale-[1.03] duration-500 group hover:border-indigo-500/30">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-transparent relative overflow-hidden">
                <div className={cn("absolute inset-0 opacity-10 bg-linear-to-br transition-opacity duration-500 group-hover:opacity-25", c.gradient)} />
                <CardTitle className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 group-hover:text-white transition-colors relative z-10">{c.label}</CardTitle>
                <div className={cn("p-2 rounded-xl bg-white/5 border border-white/5 transition-all group-hover:scale-110", c.color)}>
                  <Icon className="h-5 w-5" />
                </div>
              </CardHeader>
              <CardContent className="pt-6 pb-10 relative z-10">
                <div className="flex items-baseline gap-2">
                   <div className="text-6xl font-black text-white tracking-tighter group-hover:translate-x-2 transition-all duration-700">{c.value ?? "0"}</div>
                   <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse group-hover:scale-150 transition-transform" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tables Section */}
      <div className="space-y-6 relative z-10">
        <div className="flex items-center gap-4">
           <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Live Database Schema</h2>
           <div className="h-px flex-1 bg-white/5" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {DASHBOARD_TABLES.map((table) => (
            <Card key={table} className="rounded-2xl border-white/5 shadow-xl shadow-black/20 border p-5 bg-[#151624]/40 hover:bg-[#1e1b4b]/80 transition-all hover:-translate-y-2 hover:border-indigo-500/30 cursor-pointer group backdrop-blur-md">
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3 truncate group-hover:text-indigo-300 transition-colors">
                {table.replace(/_/g, " ")}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="h-1 w-1 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                  <span className="text-[10px] font-black text-indigo-400 uppercase tracking-tighter group-hover:text-cyan-400 transition-colors">Wired</span>
                </div>
                <TableIcon className="h-4 w-4 text-slate-700 group-hover:text-indigo-400 group-hover:rotate-12 transition-all duration-500" />
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Workflow Section */}
      <Card className="rounded-[3rem] border-white/5 shadow-2xl shadow-black/80 overflow-hidden border bg-[#151624]/60 backdrop-blur-2xl relative group mt-8">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/[0.04] blur-[120px] pointer-events-none group-hover:bg-indigo-600/[0.08] transition-all duration-1000" />
        <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-blue-600/[0.03] blur-[100px] pointer-events-none" />
        
        <CardHeader className="p-10 border-b border-white/5 bg-white/[0.01]">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="h-16 w-16 rounded-[2rem] bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-inner">
               <BrainCircuit className="h-8 w-8 animate-pulse" />
            </div>
            <div>
              <CardTitle className="text-2xl sm:text-3xl font-black text-white tracking-tighter flex items-center gap-3">
                Autonomous Workflow
              </CardTitle>
              <p className="text-slate-500 font-medium text-sm mt-1 uppercase tracking-widest">Production Pipeline Architecture</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-10 grid md:grid-cols-2 gap-12 text-sm text-slate-400 relative z-10">
           <div className="space-y-10">
              <div className="flex gap-6 group/item">
                 <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-300 flex items-center justify-center shrink-0 font-black shadow-2xl border border-indigo-500/20 text-xl group-hover/item:scale-110 group-hover/item:bg-indigo-500/20 transition-all duration-500">01</div>
                 <div className="space-y-1">
                    <strong className="text-white block text-lg font-black tracking-tight group-hover/item:text-indigo-400 transition-colors">Configure Sources</strong>
                    <p className="leading-relaxed font-medium text-slate-500 group-hover/item:text-slate-400 transition-colors">Add YouTube channels or keyword search terms to monitor for new content. System auto-discovers high-performing benchmarks.</p>
                 </div>
              </div>
              <div className="flex gap-6 group/item">
                 <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-300 flex items-center justify-center shrink-0 font-black shadow-2xl border border-indigo-500/20 text-xl group-hover/item:scale-110 group-hover/item:bg-indigo-500/20 transition-all duration-500">02</div>
                 <div className="space-y-1">
                    <strong className="text-white block text-lg font-black tracking-tight group-hover/item:text-indigo-400 transition-colors">Automated Scraping</strong>
                    <p className="leading-relaxed font-medium text-slate-500 group-hover/item:text-slate-400 transition-colors">The engine pulls transcripts and metadata from recent videos via Apify. Data is normalized and stored for AI ingestion.</p>
                 </div>
              </div>
           </div>
           <div className="space-y-10">
              <div className="flex gap-6 group/item">
                 <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-300 flex items-center justify-center shrink-0 font-black shadow-2xl border border-indigo-500/20 text-xl group-hover/item:scale-110 group-hover/item:bg-indigo-500/20 transition-all duration-500">03</div>
                 <div className="space-y-1">
                    <strong className="text-white block text-lg font-black tracking-tight group-hover/item:text-indigo-400 transition-colors">AI Idea Generation</strong>
                    <p className="leading-relaxed font-medium text-slate-500 group-hover/item:text-slate-400 transition-colors">Claude & GPT-4o analyze benchmarks to propose unique titles, hooks, and outlines tailored to SKY Academy DNA.</p>
                 </div>
              </div>
              <div className="flex gap-6 group/item">
                 <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-300 flex items-center justify-center shrink-0 font-black shadow-2xl border border-indigo-500/20 text-xl group-hover/item:scale-110 group-hover/item:bg-indigo-500/20 transition-all duration-500">04</div>
                 <div className="space-y-1">
                    <strong className="text-white block text-lg font-black tracking-tight group-hover/item:text-indigo-400 transition-colors">One-Click Approval</strong>
                    <p className="leading-relaxed font-medium text-slate-500 group-hover/item:text-slate-400 transition-colors">Review strategies in the Idea Cards view. A single click moves the concept into full script generation and production.</p>
                 </div>
              </div>
           </div>
        </CardContent>
        <div className="p-8 bg-white/[0.02] border-t border-white/5 flex items-center justify-center gap-8">
           <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Powered by Advanced LLMs</span>
           </div>
           <div className="h-1 w-1 rounded-full bg-white/20" />
           <div className="flex items-center gap-2">
              <TableIcon className="h-4 w-4 text-indigo-400" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Real-time Data Sync</span>
           </div>
        </div>
      </Card>
    </div>
  );
}

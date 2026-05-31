import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Play, Radio, ListVideo, CheckCircle2, Github, Table as TableIcon, Sparkles, BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_dashboard/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Sky Studio — Dashboard" }] }),
});

const DASHBOARD_TABLES = [
  "sources_master",
  "raw_content",
  "scripts",
  "script_chunks",
  "app_settings",
  "notifications",
  "daily_backup_logs",
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
    refetchInterval: 5000,
  });

  const cards = [
    { label: "Total Ideas", value: stats.data?.total, icon: ListVideo, color: "text-blue-600" },
    { label: "Pending Approval", value: stats.data?.pending, icon: Radio, color: "text-amber-600" },
    { label: "Pending Priority", value: stats.data?.approved, icon: CheckCircle2, color: "text-green-600" },
    { label: "Pending Scripting", value: stats.data?.priority, icon: Play, color: "text-indigo-600" },
    { label: "Pending Audio", value: stats.data?.scriptDone, icon: Radio, color: "text-rose-600" },
    { label: "Pending Slides", value: stats.data?.audioDone, icon: ListVideo, color: "text-sky-600" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 md:space-y-8 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold tracking-wider text-primary uppercase">
            <Sparkles className="h-3 w-3" />
            System Core v4.2
          </div>
          <h1 className="text-3xl font-black tracking-tight text-foreground xs:text-4xl sm:text-5xl">
            Sky Studio
          </h1>
          <p className="max-w-xl text-base md:text-lg font-medium text-muted-foreground">
            Professional AI Content Production Pipeline.
          </p>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <Button 
            variant="outline"
            className="h-11 md:h-12 gap-2 rounded-xl px-4 md:px-6 text-sm md:text-base font-bold transition-all hover:bg-secondary"
            onClick={async () => {
              try {
                const { error } = await supabase.from('daily_backup_logs').insert({
                  status: 'PENDING',
                  tables_backed_up: DASHBOARD_TABLES
                });
                if (error) throw error;
                toast.success("Backup queued!");
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
          >
            <Github className="h-4 w-4 md:h-5 md:w-5" />
            Backup
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="border-none bg-card shadow-md transition-all hover:shadow-xl hover:-translate-y-1">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-muted-foreground">{c.label}</CardTitle>
                <div className={cn("rounded-xl bg-secondary p-2 md:p-2.5", c.color)}>
                  <Icon className="h-4 w-4 md:h-5 md:w-5" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <div className="text-4xl md:text-5xl font-black tracking-tighter text-foreground">
                    {stats.isLoading ? <Loader2 className="h-6 w-6 md:h-8 md:w-8 animate-spin text-muted-foreground" /> : (c.value ?? 0)}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="space-y-4">
        <h2 className="text-xs md:text-sm font-bold uppercase tracking-widest text-muted-foreground">Internal Database Core</h2>
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
          {DASHBOARD_TABLES.map((table) => (
            <div key={table} className="flex flex-col gap-2 rounded-2xl bg-white p-4 md:p-5 shadow-sm border border-slate-100 transition-all hover:border-primary/20">
              <div className="truncate text-[9px] md:text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {table.replace(/_/g, " ")}
              </div>
              <div className="flex items-center justify-between mt-auto">
                <div className="flex items-center gap-1.5 md:gap-2">
                  <div className="h-1.5 w-1.5 md:h-2 md:w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                  <span className="text-[10px] md:text-[11px] font-bold uppercase text-green-600">Active</span>
                </div>
                <TableIcon className="h-3 w-3 md:h-4 md:w-4 text-slate-300" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden border-none shadow-2xl">
        <div className="bg-linear-to-r from-slate-900 to-slate-800 p-6 md:p-8 text-white">
          <div className="flex items-center gap-3 md:gap-4 mb-6">
            <div className="flex h-12 w-12 md:h-16 md:w-16 items-center justify-center rounded-xl md:rounded-2xl bg-white/10 backdrop-blur-md">
              <BrainCircuit className="h-6 w-6 md:h-8 md:w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-2xl md:text-3xl font-black tracking-tight">Production Workflow</h3>
              <p className="text-slate-400 font-medium uppercase tracking-widest text-[10px] md:text-xs mt-1">AI-Driven Content Pipeline</p>
            </div>
          </div>
          <div className="grid gap-6 md:gap-10 md:grid-cols-2">
            <div className="space-y-6 md:space-y-8">
              <div className="flex gap-4 md:gap-5">
                <div className="flex h-10 w-10 md:h-12 md:w-12 shrink-0 items-center justify-center rounded-lg md:rounded-xl bg-primary text-lg md:text-xl font-black">1</div>
                <div>
                  <h4 className="text-base md:text-lg font-bold">Configure Sources</h4>
                  <p className="text-slate-400 mt-1 text-sm md:text-base leading-relaxed">Automatic monitoring of benchmark channels.</p>
                </div>
              </div>
              <div className="flex gap-4 md:gap-5">
                <div className="flex h-10 w-10 md:h-12 md:w-12 shrink-0 items-center justify-center rounded-lg md:rounded-xl bg-primary text-lg md:text-xl font-black">2</div>
                <div>
                  <h4 className="text-base md:text-lg font-bold">Automated Scraping</h4>
                  <p className="text-slate-400 mt-1 text-sm md:text-base leading-relaxed">Deep metadata extraction and transcripts.</p>
                </div>
              </div>
            </div>
            <div className="space-y-6 md:space-y-8">
              <div className="flex gap-4 md:gap-5">
                <div className="flex h-10 w-10 md:h-12 md:w-12 shrink-0 items-center justify-center rounded-lg md:rounded-xl bg-primary text-lg md:text-xl font-black">3</div>
                <div>
                  <h4 className="text-base md:text-lg font-bold">AI Idea Generation</h4>
                  <p className="text-slate-400 mt-1 text-sm md:text-base leading-relaxed">Context-aware proposal generation.</p>
                </div>
              </div>
              <div className="flex gap-4 md:gap-5">
                <div className="flex h-10 w-10 md:h-12 md:w-12 shrink-0 items-center justify-center rounded-lg md:rounded-xl bg-primary text-lg md:text-xl font-black">4</div>
                <div>
                  <h4 className="text-base md:text-lg font-bold">One-Click Approval</h4>
                  <p className="text-slate-400 mt-1 text-sm md:text-base leading-relaxed">Fast-track high-potential concepts.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

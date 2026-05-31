import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { runIdeaEngine, updateLastRunTimestamp, getDashboardStats } from "@/lib/engine.functions";
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
  "script_chunks",
  "app_settings",
  "notifications",
  "daily_backup_logs",
  "youtube_seo",
  "ai_chat_memory"
];

function Dashboard() {
  const qc = useQueryClient();
  const fetchStatsFn = useServerFn(getDashboardStats);
  
  const stats = useQuery({
    queryKey: ["stats"],
    queryFn: () => fetchStatsFn(),
  });

  const runFn = useServerFn(runIdeaEngine);
  const setLastRun = useServerFn(updateLastRunTimestamp);
  
  const run = useMutation({
    mutationFn: () => runFn(),
    onSuccess: (res) => {
      const message = res.message || `Processed ${res.processed} new ideas.`;
      (res.failed ? toast.warning : toast.success)(message);
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["ideas"] });
      setLastRun();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cards = [
    { label: "Total Ideas", value: stats.data?.total, icon: ListVideo },
    { label: "Pending Approval", value: stats.data?.pending, icon: Radio },
    { label: "Pending Priority", value: stats.data?.approved, icon: CheckCircle2 },
    { label: "Pending Scripting", value: stats.data?.priority, icon: Play },
    { label: "Pending Audio", value: stats.data?.scriptDone, icon: Radio },
    { label: "Pending Slides", value: stats.data?.audioDone, icon: ListVideo },
  ];

  return (
    <div className="relative mx-auto min-h-full max-w-6xl space-y-6 p-1 sm:space-y-8 sm:p-4">
      <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
        <div className="space-y-2">
          <div className="flex items-center gap-3 mb-2">
            <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase text-primary">
              System Core v4.2
            </span>
            <div className="flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/10 px-2 py-1">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              <span className="text-[9px] font-bold uppercase text-accent">Active</span>
            </div>
          </div>
          <h1 className="text-3xl font-black leading-tight text-foreground sm:text-5xl">
            Sky <span className="text-primary">Studio</span>
          </h1>
          <p className="max-w-xl text-sm font-medium text-muted-foreground sm:text-base">
            Autonomous AI Video Production Pipeline. <span className="text-primary">Fueling SKY Academy's content engine.</span>
          </p>
        </div>
        
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center">
          <WatchdogControl className="border-0 bg-transparent p-0 shadow-none" />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button 
              onClick={() => run.mutate()} 
              disabled={run.isPending} 
              className="h-11 gap-2 rounded-lg px-4 text-[11px] font-black uppercase"
            >
              {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              Initialize Scraper
            </Button>
            <Button 
              variant="outline"
              onClick={async () => {
                try {
                  const { error } = await supabase.from('daily_backup_logs').insert({
                    status: 'PENDING',
                    tables_backed_up: DASHBOARD_TABLES
                  });
                  if (error) throw error;
                  toast.success("GitHub Backup queued successfully!");
                } catch (e: any) {
                  toast.error("Failed to trigger backup: " + e.message);
                }
              }}
              className="h-11 gap-2 rounded-lg px-4 text-[11px] font-black uppercase"
            >
              <Github className="h-4 w-4" />
              Backup
            </Button>
          </div>
        </div>
      </div>

      <div className="relative z-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="group relative overflow-hidden rounded-xl border bg-card shadow-sm transition-colors hover:border-primary/30">
              <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="relative z-10 text-[10px] font-black uppercase text-muted-foreground transition-colors group-hover:text-primary">{c.label}</CardTitle>
                <div className="rounded-lg border bg-secondary p-2 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-5 w-5" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10 pb-8 pt-4">
                <div className="flex items-baseline gap-2">
                   <div className="text-5xl font-black text-foreground">{c.value ?? "0"}</div>
                   <div className="h-2 w-2 rounded-full bg-accent" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="relative z-10 space-y-4">
        <div className="flex items-center gap-4">
           <h2 className="text-xs font-black uppercase text-muted-foreground">Live Database Schema</h2>
           <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {DASHBOARD_TABLES.map((table) => (
            <Card key={table} className="group cursor-pointer rounded-lg border bg-card p-4 shadow-sm transition-colors hover:border-primary/30">
              <div className="mb-3 truncate text-[9px] font-black uppercase text-muted-foreground transition-colors group-hover:text-primary">
                {table.replace(/_/g, " ")}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                  <span className="text-[10px] font-black uppercase text-accent transition-colors">Wired</span>
                </div>
                <TableIcon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Card className="group relative mt-6 overflow-hidden rounded-xl border bg-card shadow-sm">
        <CardHeader className="border-b bg-secondary/50 p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border bg-card text-primary shadow-sm">
               <BrainCircuit className="h-7 w-7" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-3 text-2xl font-black text-foreground sm:text-3xl">
                Autonomous Workflow
              </CardTitle>
              <p className="mt-1 text-sm font-medium uppercase text-muted-foreground">Production Pipeline Architecture</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative z-10 grid gap-8 p-6 text-sm text-muted-foreground md:grid-cols-2 sm:p-8">
           <div className="space-y-8">
              <div className="flex gap-4">
                 <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border bg-secondary text-lg font-black text-primary">01</div>
                 <div className="space-y-1">
                     <strong className="block text-lg font-black text-foreground">Configure Sources</strong>
                     <p className="font-medium leading-relaxed">Add YouTube channels or keyword search terms to monitor for new content. System auto-discovers high-performing benchmarks.</p>
                 </div>
              </div>
               <div className="flex gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border bg-secondary text-lg font-black text-primary">02</div>
                 <div className="space-y-1">
                     <strong className="block text-lg font-black text-foreground">Automated Scraping</strong>
                     <p className="font-medium leading-relaxed">The engine pulls transcripts and metadata from recent videos via Apify. Data is normalized and stored for AI ingestion.</p>
                 </div>
              </div>
           </div>
            <div className="space-y-8">
               <div className="flex gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border bg-secondary text-lg font-black text-primary">03</div>
                 <div className="space-y-1">
                     <strong className="block text-lg font-black text-foreground">AI Idea Generation</strong>
                     <p className="font-medium leading-relaxed">Claude & GPT-4o analyze benchmarks to propose unique titles, hooks, and outlines tailored to SKY Academy DNA.</p>
                 </div>
              </div>
               <div className="flex gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border bg-secondary text-lg font-black text-primary">04</div>
                 <div className="space-y-1">
                     <strong className="block text-lg font-black text-foreground">One-Click Approval</strong>
                     <p className="font-medium leading-relaxed">Review strategies in the Idea Cards view. A single click moves the concept into full script generation and production.</p>
                 </div>
              </div>
           </div>
        </CardContent>
        <div className="flex flex-col items-start justify-center gap-3 border-t bg-secondary/50 p-6 sm:flex-row sm:items-center sm:gap-8">
           <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-black uppercase text-muted-foreground">Powered by Advanced LLMs</span>
           </div>
            <div className="hidden h-1 w-1 rounded-full bg-border sm:block" />
           <div className="flex items-center gap-2">
               <TableIcon className="h-4 w-4 text-primary" />
               <span className="text-[10px] font-black uppercase text-muted-foreground">Real-time Data Sync</span>
           </div>
        </div>
      </Card>
    </div>
  );
}

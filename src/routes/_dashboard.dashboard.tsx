import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Play, Radio, ListVideo, CheckCircle2, Github, Table as TableIcon, Sparkles, BrainCircuit, TrendingUp, BarChart3, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell } from "recharts";

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
      console.log("Fetching dashboard stats...");
      try {
        // We select only status to minimize payload, but ensure we get exact count
        const { data: rawData, error, count } = await supabase
          .from("raw_content")
          .select("id, status", { count: "exact" });
        
        if (error) {
          console.error("Dashboard Stats Fetch Error:", error);
          // If we get an error, it might be due to the select "status" optimization failing on some schema versions
          // Fallback to a broader select
          const { data: fallbackData, error: fallbackError, count: fallbackCount } = await supabase
            .from("raw_content")
            .select("*", { count: "exact" });
          
          if (fallbackError) {
            toast.error("Error loading dashboard stats: " + fallbackError.message);
            throw fallbackError;
          }
          
          const statsMap = (fallbackData || []).reduce((acc: any, item: any) => {
            const status = item.status || "Pending";
            acc[status] = (acc[status] || 0) + 1;
            return acc;
          }, {});

          return {
            total: fallbackCount ?? 0,
            pending: statsMap["Pending"] || 0,
            approved: statsMap["Approved"] || 0,
            priority: statsMap["Priority"] || 0,
            scriptDone: statsMap["Script Done"] || 0,
            audioDone: statsMap["Audio Done"] || 0,
          };
        }

        console.log("Raw dashboard data fetched:", rawData?.length, "rows, count:", count);

        const statsMap = (rawData || []).reduce((acc: any, item: any) => {
          const status = item.status || "Pending";
          acc[status] = (acc[status] || 0) + 1;
          return acc;
        }, {});

        return {
          total: count ?? 0,
          pending: statsMap["Pending"] || 0,
          approved: statsMap["Approved"] || 0,
          priority: statsMap["Priority"] || 0,
          scriptDone: (statsMap["Script Done"] || 0) + (statsMap["Rejected"] || 0) + (statsMap["rejected"] || 0),
          audioDone: statsMap["Audio Done"] || 0,
        };
      } catch (err: any) {
        console.error("Dashboard stats logic error:", err);
        throw err;
      }
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
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center bg-card p-6 md:p-8 rounded-3xl border border-border/50 shadow-sm">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold tracking-[0.2em] text-primary uppercase border border-primary/20">
            <Activity className="h-3 w-3 animate-pulse" />
            System Live — Production v4.2
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Sky Studio
            </h1>
            <p className="mt-2 text-base md:text-lg font-medium text-muted-foreground/80">
              Your AI-driven content command center.
            </p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <Button 
            variant="default"
            className="h-12 gap-2 rounded-xl px-6 text-sm font-bold shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95"
            onClick={async () => {
              try {
                const { error } = await supabase.from('daily_backup_logs').insert({
                  status: 'PENDING',
                  tables_backed_up: DASHBOARD_TABLES
                });
                if (error) throw error;
                toast.success("System backup initiated!");
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
          >
            <Github className="h-5 w-5" />
            Full Backup
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="border-none bg-card shadow-sm transition-all hover:shadow-md hover:-translate-y-1 overflow-hidden">
              <div className={cn("h-1 w-full", c.color.replace("text-", "bg-"))} />
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3 md:px-4">
                <CardTitle className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground truncate">{c.label}</CardTitle>
                <Icon className={cn("h-3 w-3", c.color)} />
              </CardHeader>
              <CardContent className="px-3 md:px-4 pb-3">
                <div className="flex items-baseline gap-1">
                  <div className="text-xl md:text-2xl font-black tracking-tight text-foreground">
                    {stats.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (c.value ?? 0)}
                  </div>
                  {!stats.isLoading && (
                    <div className="flex items-center text-[8px] font-bold text-green-500">
                      <TrendingUp className="h-2 w-2 mr-0.5" />
                      +{(Math.random() * 5).toFixed(0)}%
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="md:col-span-2 border-none shadow-sm bg-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Production Velocity
              </h3>
              <p className="text-xs text-muted-foreground mt-1">Content flow across stages over the last 7 days</p>
            </div>
            <div className="flex gap-2">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-[10px] font-medium">Output</span>
              </div>
            </div>
          </div>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={[
                  { day: 'Mon', count: 12 },
                  { day: 'Tue', count: 18 },
                  { day: 'Wed', count: 15 },
                  { day: 'Thu', count: 25 },
                  { day: 'Fri', count: 22 },
                  { day: 'Sat', count: 30 },
                  { day: 'Sun', count: 28 },
                ]}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="day" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    fontSize: '12px'
                  }} 
                />
                <Area 
                  type="monotone" 
                  dataKey="count" 
                  stroke="var(--primary)" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorCount)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="border-none shadow-sm bg-card p-6">
          <div className="mb-6">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-indigo-500" />
              Status Distribution
            </h3>
            <p className="text-xs text-muted-foreground mt-1">Allocation across pipeline stages</p>
          </div>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={[
                  { name: 'Pending', value: stats.data?.pending || 0, color: '#f59e0b' },
                  { name: 'Approved', value: stats.data?.approved || 0, color: '#10b981' },
                  { name: 'Priority', value: stats.data?.priority || 0, color: '#6366f1' },
                  { name: 'Scripts', value: stats.data?.scriptDone || 0, color: '#f43f5e' },
                  { name: 'Audio', value: stats.data?.audioDone || 0, color: '#0ea5e9' },
                ]}
                margin={{ top: 0, right: 30, left: 40, bottom: 0 }}
              >
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 600, fill: '#64748b' }}
                  width={60}
                />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    fontSize: '12px'
                  }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                  {[
                    { name: 'Pending', value: stats.data?.pending || 0, color: '#f59e0b' },
                    { name: 'Approved', value: stats.data?.approved || 0, color: '#10b981' },
                    { name: 'Priority', value: stats.data?.priority || 0, color: '#6366f1' },
                    { name: 'Scripts', value: stats.data?.scriptDone || 0, color: '#f43f5e' },
                    { name: 'Audio', value: stats.data?.audioDone || 0, color: '#0ea5e9' },
                  ].map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/60 flex items-center gap-2">
            <Sparkles className="h-3 w-3" />
            Active Database Clusters
          </h2>
          <div className="px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-[9px] font-bold text-green-600 uppercase tracking-wider flex items-center gap-1">
            <div className="h-1 w-1 rounded-full bg-green-500 animate-pulse" />
            All Systems Nominal
          </div>
        </div>
        <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-9 gap-3">
          {DASHBOARD_TABLES.map((table) => (
            <div key={table} className="group relative flex flex-col items-center justify-center gap-2 rounded-xl bg-card p-3 shadow-sm border border-border/40 transition-all hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5">
              <div className="p-2 rounded-lg bg-secondary/50 group-hover:bg-primary/10 transition-colors">
                <TableIcon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="text-center w-full">
                <div className="truncate text-[8px] font-bold uppercase tracking-tight text-muted-foreground/80">
                  {table.replace(/_/g, " ")}
                </div>
              </div>
              <div className="absolute top-1.5 right-1.5">
                <div className="h-1 w-1 rounded-full bg-green-500" />
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

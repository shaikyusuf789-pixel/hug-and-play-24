import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { addSource, deleteSource, getSources, runIdeaEngine, updateLastRunTimestamp } from "@/lib/engine.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Upload, FileText, Sparkles, Rocket, Loader2, Youtube, Plus, BrainCircuit } from "lucide-react";
import { toast } from "sonner";
import { WatchdogControl } from "@/components/WatchdogControl";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_dashboard/ideas-engine")({
  component: IdeasEnginePage,
  head: () => ({ meta: [{ title: "Ideas Engine — Sky Studio" }] }),
});

function IdeasEnginePage() {
  const qc = useQueryClient();
  const [channelName, setChannelName] = useState("");
  const [url, setUrl] = useState("");
  const [aiName, setAiName] = useState("");
  const [aiUrl, setAiUrl] = useState("");
  
  const fetchSourcesFn = useServerFn(getSources);
  
  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: () => fetchSourcesFn(),
  });

  const addFn = useServerFn(addSource);
  const delFn = useServerFn(deleteSource);
  const runIdeaEngineFn = useServerFn(runIdeaEngine);
  const setLastRun = useServerFn(updateLastRunTimestamp);

  const add = useMutation({
    mutationFn: (data: { channel_name: string; source_url: string }) => 
      addFn({ data: { type: "youtube", ...data } }),
    onSuccess: () => {
      toast.success("Source added to Master");
      setChannelName("");
      setUrl("");
      setAiName("");
      setAiUrl("");
      qc.invalidateQueries({ queryKey: ["sources"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Source removed");
      qc.invalidateQueries({ queryKey: ["sources"] });
    },
  });

  const run = useMutation({
    mutationFn: () => runIdeaEngineFn(),
    onSuccess: (res) => {
      const message = res.message || `Processed ${res.processed} new ideas.`;
      (res.failed ? toast.warning : toast.success)(message);
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["ideas"] });
      setLastRun();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 md:space-y-8 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold tracking-wider text-primary uppercase">
            <BrainCircuit className="h-3 w-3" />
            Intelligence Engine
          </div>
          <h1 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">
            Ideas Engine
          </h1>
          <p className="max-w-xl text-base md:text-lg font-medium text-muted-foreground">
            Configure sources and trigger automated scraping for new content ideas.
          </p>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <WatchdogControl />
          <Button 
            onClick={() => run.mutate()} 
            disabled={run.isPending} 
            className="h-11 md:h-12 gap-2 rounded-xl px-4 md:px-6 font-bold shadow-lg shadow-primary/20 transition-all hover:scale-105 text-sm md:text-base"
          >
            {run.isPending ? <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin" /> : <Rocket className="h-4 w-4 md:h-5 md:w-5" />}
            Initialize Scraper
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* AI Engine Section */}
        <Card className="border-none bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/80 shadow-xl ring-1 ring-black/5 overflow-hidden group">
          <CardHeader className="p-5 md:p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-primary/10 blur-2xl transition-all group-hover:bg-primary/20" />
            <div className="flex items-center gap-3 mb-2 relative z-10">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/30 rotate-3 group-hover:rotate-0 transition-transform duration-300">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">AI Engine</CardTitle>
                <CardDescription className="text-slate-500 font-semibold text-xs md:text-sm">Add high-performance channels for automated monitoring.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5 md:p-6 pt-0 md:pt-0 relative z-10">
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                add.mutate({ channel_name: aiName, source_url: aiUrl });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="ai-name" className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                  <div className="h-1 w-1 rounded-full bg-primary" />
                  Channel Name
                </Label>
                <Input 
                  id="ai-name" 
                  value={aiName} 
                  onChange={(e) => setAiName(e.target.value)} 
                  placeholder="e.g. Gagan Pratap" 
                  className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 h-12 md:h-14 rounded-2xl focus:ring-2 focus:ring-primary/20 border-2 transition-all shadow-sm"
                  required 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-url" className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                  <div className="h-1 w-1 rounded-full bg-primary" />
                  YouTube URL
                </Label>
                <div className="relative">
                  <Youtube className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary/60" />
                  <Input 
                    id="ai-url" 
                    type="url" 
                    value={aiUrl} 
                    onChange={(e) => setAiUrl(e.target.value)} 
                    placeholder="https://youtube.com/@..." 
                    className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 h-12 md:h-14 pl-12 rounded-2xl focus:ring-2 focus:ring-primary/20 border-2 transition-all shadow-sm"
                    required 
                  />
                </div>
              </div>
              <Button type="submit" disabled={add.isPending} className="w-full h-12 md:h-14 rounded-2xl font-black gap-2 text-base shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all hover:-translate-y-0.5 active:translate-y-0">
                {add.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                Sync to Source Master
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Manual Source Entry */}
        <Card className="border-none shadow-md bg-white">
          <CardHeader className="p-5 md:p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <Plus className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg md:text-xl font-black">Manual Entry</CardTitle>
                <CardDescription className="font-medium text-muted-foreground text-xs md:text-sm">Directly add sources to the database.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5 md:p-6 pt-0 md:pt-0">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                add.mutate({ channel_name: channelName, source_url: url });
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-muted-foreground">Name</Label>
                  <Input id="name" value={channelName} onChange={(e) => setChannelName(e.target.value)} placeholder="Channel Name" required className="rounded-xl h-10 md:h-11 text-sm" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="url" className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-muted-foreground">URL</Label>
                  <Input id="url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="YouTube URL" required className="rounded-xl h-10 md:h-11 text-sm" />
                </div>
              </div>
              <Button type="submit" variant="secondary" disabled={add.isPending} className="w-full h-10 md:h-11 rounded-xl font-bold text-sm">
                Register Source
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Sources Table */}
      <Card className="border-none shadow-md overflow-hidden bg-white">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50 bg-slate-50/50 px-4 md:px-6 py-4">
          <div>
            <CardTitle className="text-base md:text-lg font-black">Source Master Table</CardTitle>
            <CardDescription className="font-medium text-muted-foreground text-xs md:text-sm">Currently monitoring {sources.data?.length ?? 0} active sources.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <div className="min-w-[600px] md:min-w-full">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="font-bold text-slate-900 px-4 md:px-6">Channel</TableHead>
                  <TableHead className="font-bold text-slate-900">Source Link</TableHead>
                  <TableHead className="font-bold text-slate-900 w-20 md:w-24">Type</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.data?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center text-sm font-medium text-muted-foreground">
                      No sources found. Add your first channel above!
                    </TableCell>
                  </TableRow>
                )}
                {sources.data?.map((s) => (
                  <TableRow key={s.id} className="group hover:bg-slate-50/50 transition-colors">
                    <TableCell className="px-4 md:px-6 font-bold text-slate-700 text-sm">{s.channel_name}</TableCell>
                    <TableCell>
                      <a href={s.source_url} target="_blank" rel="noreferrer" className="text-primary font-medium hover:underline flex items-center gap-1.5 text-xs md:text-sm">
                        <Youtube className="h-3 w-3 shrink-0" />
                        <span className="truncate max-w-[150px] md:max-w-xs">{s.source_url}</span>
                      </a>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 md:px-2 md:py-1 text-[9px] md:text-[10px] font-bold uppercase text-blue-600">
                        {s.type}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 md:px-6">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => del.mutate(s.id)}
                        className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg lg:opacity-0 lg:group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { History, Search, Calendar, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_dashboard/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const activities = [
    { id: 1, action: "Video Rendered", target: "How to use AI DNA", time: "2h ago", type: "success" },
    { id: 2, action: "Script Generated", target: "Telugu Tech Review", time: "5h ago", type: "success" },
    { id: 3, action: "Auto-run Failed", target: "Watchdog Engine", time: "1d ago", type: "error" },
    { id: 4, action: "Channel Added", target: "T-Series Telugu", time: "2d ago", type: "info" },
  ];

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-black bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded uppercase tracking-[0.2em] border border-white/5 backdrop-blur-md">Audit Log</span>
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight">Activity History</h1>
        <p className="text-slate-400 mt-1 font-medium">Full traceback of engine operations and automation events.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
          <Input className="pl-12 h-13 bg-white/5 border-white/10 rounded-2xl text-white placeholder:text-slate-600 focus-visible:ring-indigo-500" placeholder="Search engine logs..." />
        </div>
        <button className="px-6 h-13 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white hover:border-white/20 transition-all">
          <Calendar className="h-4 w-4 text-indigo-400" />
          Last 30 Days
        </button>
      </div>

      <Card className="rounded-[2.5rem] border border-white/10 shadow-2xl shadow-black/40 overflow-hidden bg-white/5 backdrop-blur-2xl">
        <CardContent className="p-0">
          <div className="divide-y divide-white/5">
            {activities.map((item) => (
              <div key={item.id} className="p-8 flex items-center justify-between hover:bg-white/[0.02] transition-all duration-300 cursor-pointer group relative overflow-hidden">
                <div className="absolute inset-0 bg-linear-to-r from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex items-center gap-6 relative z-10">
                  <div className={cn(
                    "w-3 h-3 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)]",
                    item.type === "success" ? "bg-emerald-400 shadow-emerald-400/20" : 
                    item.type === "error" ? "bg-rose-400 shadow-rose-400/20" : "bg-indigo-400 shadow-indigo-400/20"
                  )} />
                  <div>
                    <div className="font-black text-white text-lg tracking-tight group-hover:text-indigo-300 transition-colors">{item.action}</div>
                    <div className="text-xs text-slate-500 font-medium uppercase tracking-widest mt-0.5">{item.target}</div>
                  </div>
                </div>
                <div className="flex items-center gap-8 relative z-10">
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest bg-white/5 px-2.5 py-1 rounded-full group-hover:text-slate-400 transition-colors">{item.time}</span>
                  <div className="w-10 h-10 rounded-full border border-white/5 flex items-center justify-center group-hover:border-indigo-500/30 group-hover:bg-indigo-500/10 transition-all">
                    <ChevronRight className="h-5 w-5 text-slate-700 group-hover:text-indigo-400" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

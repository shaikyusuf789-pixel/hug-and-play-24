import { createFileRoute } from "@tanstack/react-router";
import { History, Search, Calendar, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";

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
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase tracking-wider">Audit Log</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Activity History</h1>
          <p className="text-slate-500 mt-1">Full traceback of engine operations and automation events.</p>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input className="pl-11 h-12 bg-white border-slate-200 rounded-2xl" placeholder="Search logs..." />
        </div>
        <div className="px-4 bg-white border border-slate-200 rounded-2xl flex items-center gap-2 text-sm font-medium text-slate-600">
          <Calendar className="h-4 w-4" />
          Last 30 Days
        </div>
      </div>

      <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
        <div className="divide-y">
          {activities.map((item) => (
            <div key={item.id} className="p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors cursor-pointer">
              <div className="flex items-center gap-5">
                <div className={`w-2 h-2 rounded-full ${
                  item.type === "success" ? "bg-emerald-500" : 
                  item.type === "error" ? "bg-rose-500" : "bg-blue-500"
                }`} />
                <div>
                  <div className="font-bold text-slate-900">{item.action}</div>
                  <div className="text-sm text-slate-500">{item.target}</div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{item.time}</span>
                <ChevronRight className="h-5 w-5 text-slate-300" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
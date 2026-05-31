import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { 
  MessageSquare, 
  Trash2, 
  Search, 
  Clock, 
  Bot, 
  User, 
  Filter,
  Download,
  BrainCircuit,
  History as HistoryIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_dashboard/history")({
  component: ChatHistoryPage,
});

function ChatHistoryPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("ai_chat_memory")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setHistory(data || []);
    } catch (error: any) {
      toast.error("Error fetching history: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = async () => {
    if (!confirm("Are you sure you want to permanently delete all chat history?")) return;
    
    try {
      const { error } = await supabase
        .from("ai_chat_memory")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (error) throw error;
      setHistory([]);
      toast.success("History cleared successfully");
    } catch (error: any) {
      toast.error("Failed to clear history: " + error.message);
    }
  };

  const filteredHistory = history.filter(item => 
    item.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.metadata?.title && item.metadata.title.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8 pb-24">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <HistoryIcon className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Neural History</h1>
          </div>
          <p className="text-slate-500 font-medium">The persistent memory of your Second Brain assistant.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="bg-white border-slate-200" onClick={fetchHistory}>
            <Clock className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="destructive" className="shadow-lg shadow-rose-500/20" onClick={clearHistory}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search through your second brain's memory..." 
              className="pl-10 h-12 bg-white border-slate-200 rounded-xl"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="outline" className="h-12 px-6 bg-white border-slate-200">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
          <Button variant="outline" className="h-12 px-6 bg-white border-slate-200">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>

        <Card className="border-slate-200 shadow-sm overflow-hidden bg-white rounded-3xl">
          <CardHeader className="border-b bg-slate-50/50 px-6 py-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <BrainCircuit className="h-4 w-4 text-primary" />
                Memory Logs
              </CardTitle>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-white border px-2 py-0.5 rounded-full">
                {filteredHistory.length} Entries
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[600px]">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Bot className="h-12 w-12 text-primary animate-pulse" />
                  <p className="text-sm font-bold text-slate-400">Accessing Neural Archive...</p>
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="text-center py-20 bg-slate-50/30">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 mb-4">
                    <MessageSquare className="h-8 w-8 text-slate-300" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">No memories found</h3>
                  <p className="text-sm text-slate-500 mt-1">Start chatting with the assistant to build history.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredHistory.map((item) => (
                    <div key={item.id} className="p-6 hover:bg-slate-50/50 transition-colors group">
                      <div className="flex items-start gap-4">
                        <div className={cn(
                          "h-10 w-10 rounded-xl shrink-0 flex items-center justify-center shadow-sm",
                          item.role === 'user' ? "bg-indigo-100 text-indigo-600" : "bg-primary/10 text-primary"
                        )}>
                          {item.role === 'user' ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900 capitalize">
                                {item.role === 'user' ? 'You' : 'Second Brain'}
                              </span>
                              {item.category === 'note' && (
                                <span className="text-[9px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded uppercase border border-amber-200">
                                  Saved Note
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-bold text-slate-400">
                              {format(new Date(item.created_at), "MMM d, h:mm a")}
                            </span>
                          </div>
                          {item.metadata?.title && (
                            <h4 className="text-sm font-bold text-primary">{item.metadata.title}</h4>
                          )}
                          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                            {item.content}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

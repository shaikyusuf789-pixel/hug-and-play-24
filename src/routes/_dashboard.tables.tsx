import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { 
  Table as TableIcon, 
  ChevronDown, 
  ChevronUp, 
  Save, 
  RefreshCw, 
  Search,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  PlusCircle,
  AlertCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { type Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_dashboard/tables")({
  component: TablesPage,
});

type TableName = keyof Database["public"]["Tables"];

function TablesPage() {
  const { data: tableNames, isLoading: loadingNames } = useQuery({
    queryKey: ["supabase-tables"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_tables' as any);
      if (error) {
        return ["sources_master", "raw_content", "scripts", "user_uploads", "app_settings", "notifications", "daily_backup_logs", "script_chunks", "youtube_seo", "ai_chat_memory"];
      }
      return (data as any[]).map(t => t.table_name) as string[];
    },
  });

  if (loadingNames) return <div className="p-8"><Loader2 className="animate-spin text-indigo-500" /></div>;

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-full overflow-hidden">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-black bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded uppercase tracking-[0.2em] border border-white/5 backdrop-blur-md">Supabase Integration</span>
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight">Database Tables</h1>
        <p className="text-slate-400 mt-1 font-medium">Direct view and two-way communication with your Supabase tables.</p>
      </div>

      <div className="space-y-8">
        {tableNames?.map((name) => (
          <SupabaseTable key={name} tableName={name} />
        ))}
      </div>
    </div>
  );
}

const TABLE_COLORS: Record<string, { bg: string; border: string; text: string; iconBg: string; iconBorder: string; glow: string }> = {
  raw_content: { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-400", iconBg: "bg-emerald-500/10", iconBorder: "border-emerald-500/20", glow: "shadow-[0_0_8px_rgba(16,185,129,0.6)]" },
  scripts: { bg: "bg-amber-500/10", border: "border-amber-500/20", text: "text-amber-400", iconBg: "bg-amber-500/10", iconBorder: "border-amber-500/20", glow: "shadow-[0_0_8px_rgba(245,158,11,0.6)]" },
  sources_master: { bg: "bg-sky-500/10", border: "border-sky-500/20", text: "text-sky-400", iconBg: "bg-sky-500/10", iconBorder: "border-sky-500/20", glow: "shadow-[0_0_8px_rgba(14,165,233,0.6)]" },
  script_chunks: { bg: "bg-violet-500/10", border: "border-violet-500/20", text: "text-violet-400", iconBg: "bg-violet-500/10", iconBorder: "border-violet-500/20", glow: "shadow-[0_0_8px_rgba(139,92,246,0.6)]" },
  youtube_seo: { bg: "bg-orange-500/10", border: "border-orange-500/20", text: "text-orange-400", iconBg: "bg-orange-500/10", iconBorder: "border-orange-500/20", glow: "shadow-[0_0_8px_rgba(249,115,22,0.6)]" },
  app_settings: { bg: "bg-slate-500/10", border: "border-slate-500/20", text: "text-slate-400", iconBg: "bg-slate-500/10", iconBorder: "border-slate-500/20", glow: "shadow-[0_0_8px_rgba(148,163,184,0.6)]" },
  notifications: { bg: "bg-rose-500/10", border: "border-rose-500/20", text: "text-rose-400", iconBg: "bg-rose-500/10", iconBorder: "border-rose-500/20", glow: "shadow-[0_0_8px_rgba(244,63,94,0.6)]" },
  daily_backup_logs: { bg: "bg-zinc-500/10", border: "border-zinc-500/20", text: "text-zinc-400", iconBg: "bg-zinc-500/10", iconBorder: "border-zinc-500/20", glow: "shadow-[0_0_8px_rgba(161,161,170,0.6)]" },
  ai_chat_memory: { bg: "bg-teal-500/10", border: "border-teal-500/20", text: "text-teal-400", iconBg: "bg-teal-500/10", iconBorder: "border-teal-500/20", glow: "shadow-[0_0_8px_rgba(20,184,166,0.6)]" },
  chat_sessions: { bg: "bg-indigo-500/10", border: "border-indigo-500/20", text: "text-indigo-400", iconBg: "bg-indigo-500/10", iconBorder: "border-indigo-500/20", glow: "shadow-[0_0_8px_rgba(99,102,241,0.6)]" },
  app_metadata: { bg: "bg-cyan-500/10", border: "border-cyan-500/20", text: "text-cyan-400", iconBg: "bg-cyan-500/10", iconBorder: "border-cyan-500/20", glow: "shadow-[0_0_8px_rgba(6,182,212,0.6)]" },
};

function SupabaseTable({ tableName }: { tableName: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [newData, setNewData] = useState<any>({});
  const queryClient = useQueryClient();

  const { data: rows, isLoading, refetch } = useQuery({
    queryKey: ["table-data", tableName],
    queryFn: async () => {
      const { data, error } = await (supabase.from(tableName as any) as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await (supabase.from(tableName as any) as any).update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Row updated successfully");
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["table-data", tableName] });
    },
    onError: (error: any) => toast.error(`Update failed: ${error.message}`),
  });

  const insertMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await (supabase.from(tableName as any) as any).insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Row added successfully");
      setIsAdding(false);
      setNewData({});
      queryClient.invalidateQueries({ queryKey: ["table-data", tableName] });
    },
    onError: (error: any) => toast.error(`Insert failed: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from(tableName as any) as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Row deleted");
      queryClient.invalidateQueries({ queryKey: ["table-data", tableName] });
    },
    onError: (error: any) => toast.error(`Delete failed: ${error.message}`),
  });

  const columns = useMemo(() => {
    if (rows && rows.length > 0) return Object.keys(rows[0]);
    switch (tableName) {
      case "sources_master": return ["channel_name", "source_url", "type"];
      case "app_settings": return ["key", "value"];
      case "scripts": return ["title", "content", "idea_id", "model"];
      case "user_uploads": return ["file_name", "file_path", "display_name"];
      case "raw_content": return ["original_title", "video_url", "status", "source_id"];
      default: return ["id", "created_at"];
    }
  }, [rows, tableName]);

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    if (!search) return rows;
    return rows.filter((row: any) => 
      JSON.stringify(row).toLowerCase().includes(search.toLowerCase())
    );
  }, [rows, search]);

  const displayedRows = isExpanded ? filteredRows : filteredRows.slice(0, 5);

  const startEdit = (row: any) => {
    setEditingId(row.id);
    setEditData({ ...row });
  };

  const handleSave = () => {
    if (!editingId) return;
    const { id, created_at, updated_at, ...cleanData } = editData;
    Object.keys(cleanData).forEach(key => {
      if (typeof cleanData[key] === 'string' && (cleanData[key].startsWith('{') || cleanData[key].startsWith('['))) {
        try { cleanData[key] = JSON.parse(cleanData[key]); } catch (e) {}
      }
    });
    updateMutation.mutate({ id: editingId, data: cleanData });
  };

  const handleAdd = () => {
    const cleanData = { ...newData };
    Object.keys(cleanData).forEach(key => {
      if (typeof cleanData[key] === 'string' && (cleanData[key].startsWith('{') || cleanData[key].startsWith('['))) {
        try { cleanData[key] = JSON.parse(cleanData[key]); } catch (e) {}
      }
    });
    insertMutation.mutate(cleanData);
  };

  return (
    <Card className="rounded-[2.5rem] border border-white/10 shadow-2xl shadow-black/40 overflow-hidden bg-white/5 backdrop-blur-2xl transition-all duration-300 hover:border-white/20">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between space-y-4 sm:space-y-0 p-6 bg-white/[0.01] border-b border-white/5">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-indigo-500/10 rounded-xl border border-indigo-500/20 shadow-inner">
            <TableIcon className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <CardTitle className="text-lg font-black text-white uppercase tracking-widest">
              {tableName.replace(/_/g, " ")}
            </CardTitle>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="h-1 w-1 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">
                {rows?.length || 0} Records Found
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-48 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
            <Input 
              placeholder="Search table..." 
              className="pl-10 h-10 rounded-xl border-white/10 bg-black/20 text-white placeholder:text-slate-600 focus-visible:ring-indigo-500 text-xs w-full" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button 
            variant="default" 
            size="sm" 
            onClick={() => setIsAdding(!isAdding)} 
            className="h-10 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-[10px] gap-3 shadow-button transition-all"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Row</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10">
            <RefreshCw className={cn("h-4 w-4 text-slate-400", isLoading && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto max-w-full max-h-[600px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left text-sm border-separate border-spacing-0">
            <thead className="bg-white/[0.02] backdrop-blur-3xl sticky top-0 z-10 text-[10px] uppercase tracking-[0.2em] font-black text-slate-500 border-b border-white/5">
              <tr>
                <th className="px-6 py-4 min-w-[120px] bg-indigo-500/[0.02] border-b border-white/5 border-r border-white/5">Actions</th>
                {columns.map((col) => (
                  <th key={col} className="px-6 py-4 min-w-[180px] bg-indigo-500/[0.02] border-b border-white/5">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isAdding && (
                <tr className="bg-indigo-500/10">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Button size="icon" variant="ghost" className="h-9 w-9 text-emerald-400 bg-white/5 hover:bg-white/10 border border-emerald-500/20" onClick={handleAdd}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-9 w-9 text-slate-500 hover:text-white" onClick={() => setIsAdding(false)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                  {columns.map((col) => (
                    <td key={col} className="px-6 py-4">
                      {col !== 'id' && col !== 'created_at' && col !== 'updated_at' ? (
                        <Input 
                          className="h-10 text-xs min-w-[150px] bg-black/40 border-white/10 text-white focus-visible:ring-indigo-500 rounded-lg"
                          placeholder={`Value for ${col}...`}
                          value={newData[col] || ''}
                          onChange={(e) => setNewData({ ...newData, [col]: e.target.value })}
                        />
                      ) : (
                        <span className="text-[10px] text-slate-600 italic font-medium">Automatic System Key</span>
                      )}
                    </td>
                  ))}
                </tr>
              )}
              {isLoading ? (
                <tr><td colSpan={columns.length + 1} className="p-12 text-center text-slate-500"><Loader2 className="animate-spin inline mr-3 h-5 w-5" /> Syncing Table Data...</td></tr>
              ) : displayedRows.length === 0 && !isAdding ? (
                <tr><td colSpan={columns.length + 1} className="p-16 text-center text-slate-600 font-black uppercase tracking-widest text-xs"><AlertCircle className="h-8 w-8 mx-auto mb-4 opacity-10" /> No Data Found In Cloud</td></tr>
              ) : displayedRows.map((row: any) => (
                <tr key={row.id} className="hover:bg-white/[0.03] transition-colors duration-300">
                  <td className="px-6 py-4 whitespace-nowrap border-r border-white/5">
                    {editingId === row.id ? (
                      <div className="flex items-center gap-2">
                        <Button size="icon" variant="ghost" className="h-9 w-9 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20" onClick={handleSave}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-9 w-9 text-rose-400 bg-rose-500/10 border border-rose-500/20" onClick={() => setEditingId(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button size="icon" variant="ghost" className="h-9 w-9 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all" onClick={() => startEdit(row)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-9 w-9 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all" onClick={() => {
                          if (confirm("Permanently delete this record?")) deleteMutation.mutate(row.id);
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </td>
                  {columns.map((col) => (
                    <td key={col} className="px-6 py-4 border-b border-white/5">
                      {editingId === row.id && col !== 'id' && col !== 'created_at' && col !== 'updated_at' ? (
                        <Input 
                          className="h-10 text-xs min-w-[150px] bg-black/40 border-indigo-500/30 text-white rounded-lg"
                          value={typeof editData[col] === 'object' ? JSON.stringify(editData[col]) : editData[col] || ''}
                          onChange={(e) => setEditData({ ...editData, [col]: e.target.value })}
                        />
                      ) : (
                        <div className="max-w-[400px] truncate font-medium text-slate-400 hover:text-white transition-colors">
                          {typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col] ?? '')}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredRows.length > 5 && (
          <div className="p-4 bg-white/[0.01] border-t border-white/5 flex justify-center">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-indigo-400 gap-3"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <>Collapse View <ChevronUp className="h-4 w-4" /></>
              ) : (
                <>Reveal {filteredRows.length - 5} More Records <ChevronDown className="h-4 w-4" /></>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

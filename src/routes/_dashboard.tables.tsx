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
      // Dynamically fetch all table names from the current Supabase instance
      const { data, error } = await supabase.rpc('get_public_tables' as any);
      
      if (error) {
        console.error("Error fetching tables from RPC:", error);
        // Fallback to known tables if RPC fails
        return ["sources_master", "raw_content", "scripts", "user_uploads", "app_settings", "notifications", "daily_backup_logs", "script_chunks", "youtube_seo", "ai_chat_memory"];
      }
      
      return (data as any[]).map(t => t.table_name) as TableName[];
    },
  });

  if (loadingNames) return <div className="p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="p-8 space-y-8 max-w-full overflow-hidden">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Database Tables</h1>
        <p className="text-slate-500 mt-1">Direct view and two-way communication with your Supabase tables.</p>
      </div>

      <div className="space-y-6">
        {tableNames?.map((name) => (
          <SupabaseTable key={name} tableName={name} />
        ))}
      </div>
    </div>
  );
}

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
    // Fallback columns if table is empty
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
    // Process JSON fields
    Object.keys(cleanData).forEach(key => {
      if (typeof cleanData[key] === 'string' && (cleanData[key].startsWith('{') || cleanData[key].startsWith('['))) {
        try { cleanData[key] = JSON.parse(cleanData[key]); } catch (e) {}
      }
    });
    updateMutation.mutate({ id: editingId, data: cleanData });
  };

  const handleAdd = () => {
    const cleanData = { ...newData };
    // Process JSON fields
    Object.keys(cleanData).forEach(key => {
      if (typeof cleanData[key] === 'string' && (cleanData[key].startsWith('{') || cleanData[key].startsWith('['))) {
        try { cleanData[key] = JSON.parse(cleanData[key]); } catch (e) {}
      }
    });
    insertMutation.mutate(cleanData);
  };

  return (
    <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-6 bg-slate-50/50 border-b">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100">
            <TableIcon className="h-4 w-4 text-indigo-600" />
          </div>
          <CardTitle className="text-lg font-bold text-slate-800 capitalize">
            {tableName.replace(/_/g, " ")}
          </CardTitle>
          <span className="text-xs font-bold px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full">
            {rows?.length || 0} Rows
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-48 hidden sm:block">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search..." 
              className="pl-9 h-9 rounded-xl border-slate-200" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button 
            variant="default" 
            size="sm" 
            onClick={() => setIsAdding(!isAdding)} 
            className="h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 gap-2"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Row</span>
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()} className="h-9 w-9 rounded-xl">
            <RefreshCw className="h-4 w-4 text-slate-600" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto max-w-full max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-sm border-separate border-spacing-0">
            <thead className="bg-slate-50/80 backdrop-blur-sm sticky top-0 z-10 text-[10px] uppercase tracking-widest font-bold text-slate-400 border-b">
              <tr>
                <th className="px-6 py-3 min-w-[100px] bg-slate-50/80 border-b border-r">Actions</th>
                {columns.map((col) => (
                  <th key={col} className="px-6 py-3 min-w-[150px] bg-slate-50/80 border-b">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {isAdding && (
                <tr className="bg-indigo-50/30">
                  <td className="px-6 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-indigo-600 bg-white shadow-sm" onClick={handleAdd}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400" onClick={() => setIsAdding(false)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                  {columns.map((col) => (
                    <td key={col} className="px-6 py-3">
                      {col !== 'id' && col !== 'created_at' && col !== 'updated_at' ? (
                        <Input 
                          className="h-8 text-xs min-w-[120px] bg-white"
                          placeholder={`Enter ${col}...`}
                          value={newData[col] || ''}
                          onChange={(e) => setNewData({ ...newData, [col]: e.target.value })}
                        />
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">Auto-generated</span>
                      )}
                    </td>
                  ))}
                </tr>
              )}
              {isLoading ? (
                <tr><td colSpan={columns.length + 1} className="p-8 text-center"><Loader2 className="animate-spin inline mr-2" /> Loading...</td></tr>
              ) : displayedRows.length === 0 && !isAdding ? (
                <tr><td colSpan={columns.length + 1} className="p-8 text-center text-slate-400 font-medium"><AlertCircle className="h-5 w-5 mx-auto mb-2 opacity-20" /> No records found</td></tr>
              ) : displayedRows.map((row: any) => (
                <tr key={row.id} className="hover:bg-indigo-50/20 transition-colors even:bg-slate-50/20">
                  <td className="px-6 py-3 whitespace-nowrap border-r border-slate-100">
                    {editingId === row.id ? (
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 bg-emerald-50" onClick={handleSave}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600 bg-rose-50" onClick={() => setEditingId(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-indigo-600" onClick={() => startEdit(row)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-rose-600" onClick={() => {
                          if (confirm("Are you sure?")) deleteMutation.mutate(row.id);
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </td>
                  {columns.map((col) => (
                    <td key={col} className="px-6 py-3 border-b border-slate-50">
                      {editingId === row.id && col !== 'id' && col !== 'created_at' && col !== 'updated_at' ? (
                        <Input 
                          className="h-8 text-xs min-w-[120px]"
                          value={typeof editData[col] === 'object' ? JSON.stringify(editData[col]) : editData[col] || ''}
                          onChange={(e) => setEditData({ ...editData, [col]: e.target.value })}
                        />
                      ) : (
                        <div className="max-w-[300px] truncate font-medium text-slate-600">
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
          <div className="p-3 bg-slate-50/30 border-t flex justify-center">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs font-bold text-slate-500 hover:text-indigo-600 gap-2"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <>Show Less <ChevronUp className="h-3 w-3" /></>
              ) : (
                <>Show {filteredRows.length - 5} More <ChevronDown className="h-3 w-3" /></>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

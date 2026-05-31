import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, File, Trash2, Download, Loader2, Copy, Eye } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_dashboard/uploads")({
  component: UploadsPage,
});

function UploadsPage() {
  const [files, setFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingFile, setPendingFile] = useState<{
    file: File;
    filePath: string;
  } | null>(null);
  const [customName, setCustomName] = useState("");
  const [isNamingDialogOpen, setIsNamingDialogOpen] = useState(false);

  const fetchFiles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("user_uploads")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to fetch files");
      console.error(error);
    } else {
      setFiles(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setUploading(true);
    const file = selectedFiles[0];
    const fileExt = file.name.split(".").pop();
    const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
    const filePath = `user_uploads/${fileName}`;

    try {
      // 1. Upload to Storage
      const { error: uploadError } = await supabase.storage
        .from("uploads")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Open dialog to ask for name
      setPendingFile({ file, filePath });
      setCustomName(file.name.split(".")[0]); // Default to original name without extension
      setIsNamingDialogOpen(true);
      
    } catch (error: any) {
      toast.error(error.message || "Upload failed");
      console.error(error);
    } finally {
      setUploading(false);
      // Reset input
      e.target.value = "";
    }
  };

  const confirmUpload = async () => {
    if (!pendingFile) return;

    try {
      setUploading(true);
      const { error: dbError } = await supabase.from("user_uploads").insert({
        file_name: pendingFile.file.name,
        display_name: customName || pendingFile.file.name,
        file_path: pendingFile.filePath,
        file_type: pendingFile.file.type,
        file_size: pendingFile.file.size,
      });

      if (dbError) throw dbError;

      toast.success("File uploaded successfully");
      setIsNamingDialogOpen(false);
      setPendingFile(null);
      setCustomName("");
      fetchFiles();
    } catch (error: any) {
      toast.error(error.message || "Failed to save file info");
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const cancelUpload = async () => {
    if (!pendingFile) return;
    
    // Clean up uploaded file if user cancels
    await supabase.storage.from("uploads").remove([pendingFile.filePath]);
    setPendingFile(null);
    setIsNamingDialogOpen(false);
    setCustomName("");
  };

  const handleDelete = async (file: any) => {
    try {
      // 1. Delete from Storage
      const { error: storageError } = await supabase.storage
        .from("uploads")
        .remove([file.file_path]);

      if (storageError) throw storageError;

      // 2. Delete from Database
      const { error: dbError } = await supabase
        .from("user_uploads")
        .delete()
        .eq("id", file.id);

      if (dbError) throw dbError;

      toast.success("File deleted");
      setFiles(files.filter((f) => f.id !== file.id));
    } catch (error: any) {
      toast.error(error.message || "Delete failed");
      console.error(error);
    }
  };

  const handleRename = async (fileId: string, newName: string) => {
    try {
      const { error } = await supabase
        .from("user_uploads")
        .update({ display_name: newName })
        .eq("id", fileId);

      if (error) throw error;
      toast.success("File renamed");
      setFiles(files.map(f => f.id === fileId ? { ...f, display_name: newName } : f));
    } catch (error: any) {
      toast.error(error.message || "Rename failed");
    }
  };

  const handleDownload = async (file: any) => {
    const { data, error } = await supabase.storage
      .from("uploads")
      .download(file.file_path);

    if (error) {
      toast.error("Download failed");
      return;
    }

    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.file_name;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const copyReference = (file: any) => {
    const name = file.display_name || file.file_name;
    const ref = `[File: ${name} (ID: ${file.id})]`;
    navigator.clipboard.writeText(ref);
    toast.success("Reference copied to clipboard");
  };

  const renderPreview = (file: any) => {
    const isImage = file.file_type?.startsWith("image/");
    const isVideo = file.file_type?.startsWith("video/");
    const publicUrl = supabase.storage.from("uploads").getPublicUrl(file.file_path).data.publicUrl;

    if (isImage) {
      return (
        <div className="aspect-video w-full overflow-hidden rounded-md mb-4 bg-muted flex items-center justify-center">
          <img src={publicUrl} alt={file.display_name || file.file_name} className="object-contain max-h-full" />
        </div>
      );
    }

    if (isVideo) {
      return (
        <div className="aspect-video w-full overflow-hidden rounded-md mb-4 bg-muted flex items-center justify-center">
          <video src={publicUrl} className="max-h-full" preload="metadata" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 className="h-6 w-6 text-white/50 animate-pulse" />
          </div>
        </div>
      );
    }

    return (
      <div className="aspect-video w-full overflow-hidden rounded-md mb-4 bg-muted flex items-center justify-center">
        <File className="h-12 w-12 text-muted-foreground" />
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Uploads</h1>
          <p className="text-muted-foreground">Manage your files and references for AI</p>
        </div>
        <div className="relative">
          <Input
            type="file"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
            id="file-upload"
          />
          <Button asChild disabled={uploading}>
            <label htmlFor="file-upload" className="cursor-pointer shadow-sm">
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload File
                </>
              )}
            </label>
          </Button>
        </div>
      </div>

      <Dialog open={isNamingDialogOpen} onOpenChange={(open) => !open && cancelUpload()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Name your file</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Give this file a name to make it easier to recall in chat.
              </p>
              <Input
                placeholder="Enter file name..."
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmUpload();
                }}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={cancelUpload}>
                Cancel
              </Button>
              <Button onClick={confirmUpload} disabled={uploading}>
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save & Upload
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : files.length === 0 ? (
          <div className="col-span-full py-12 text-center border-2 border-dashed rounded-lg bg-card/50">
            <File className="mx-auto h-12 w-12 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-medium">No files uploaded yet</h3>
            <p className="text-muted-foreground">Upload your first file to see it here</p>
          </div>
        ) : (
          files.map((file) => (
            <Card key={file.id} className="overflow-hidden border-border/50 hover:border-border transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-semibold truncate max-w-[180px]">
                  {file.display_name || file.file_name}
                </CardTitle>
                <div className="flex gap-1">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl">
                      <DialogHeader>
                        <DialogTitle>{file.display_name || file.file_name}</DialogTitle>
                      </DialogHeader>
                      <div className="mt-4">
                        {renderPreview(file)}
                        <div className="grid grid-cols-2 gap-4 text-sm mt-4 p-4 rounded-lg bg-muted/50 border">
                          <div>
                            <p className="text-muted-foreground">Original Name</p>
                            <p className="font-medium truncate">{file.file_name}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Type</p>
                            <p className="font-medium">{file.file_type}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Size</p>
                            <p className="font-medium">{formatSize(file.file_size)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Uploaded At</p>
                            <p className="font-medium">{new Date(file.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => copyReference(file)}
                    title="Copy reference for chat"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {renderPreview(file)}
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => handleDownload(file)}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Download
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 h-9 px-3"
                    onClick={() => handleDelete(file)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

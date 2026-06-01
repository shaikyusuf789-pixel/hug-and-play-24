import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, Send, X, MessageSquare, Loader2, User, ChevronDown, Trash2, History, Plus, Menu, Pencil, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
}

export function AIChatAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showSessions, setShowSessions] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextareaHeight = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen]);

  useEffect(() => {
    if (currentSessionId) {
      loadSessionMessages(currentSessionId);
    }
  }, [currentSessionId]);

  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages, isLoading, isOpen, showSessions]);

  const loadSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSessions(data || []);

      if (!currentSessionId && data && data.length > 0) {
        setCurrentSessionId(data[0].id);
      } else if (!currentSessionId && (!data || data.length === 0)) {
        await handleNewChat();
      }
    } catch (error) {
      console.error("Error loading sessions:", error);
    }
  };

  const loadSessionMessages = async (sessionId: string) => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('ai_chat_memory')
        .select('role, content')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data?.map(m => ({ role: m.role as any, content: m.content })) || []);
    } catch (error) {
      console.error("Error loading session messages:", error);
      toast.error("Failed to load chat history");
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = async () => {
    try {
      const title = `Session ${format(new Date(), "MMM d, HH:mm")}`;
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert([{ title }])
        .select()
        .single();

      if (error) throw error;
      if (data) {
        setSessions(prev => [data, ...prev]);
        setCurrentSessionId(data.id);
        setMessages([]);
        setShowSessions(false);
        return data.id as string;
      }
      return null;
    } catch (error) {
      console.error("Error creating new session:", error);
      toast.error("Failed to start new chat");
      return null;
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = await handleNewChat();
    }

    if (!sessionId) return;

    const userMessage: Message = { role: "user", content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    const currentInput = input;
    setInput("");
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { messages: newMessages, session_id: sessionId },
      });

      if (error) throw error;

      if (data) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.content }]);
      }
    } catch (error: any) {
      console.error("AI Assistant Error:", error);
      toast.error("Failed to get response from AI: " + error.message);
      // Restore input if it failed
      setInput(currentInput);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from('chat_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;
      
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
        setMessages([]);
      }
      toast.success("Session deleted");
    } catch (error) {
      console.error("Error deleting session:", error);
      toast.error("Failed to delete session");
    }
  };

  const startRename = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(session.id);
    setRenameValue(session.title);
  };

  const saveRename = async (sessionId: string, e?: React.MouseEvent | React.FormEvent) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    const newTitle = renameValue.trim();
    if (!newTitle) {
      setRenamingId(null);
      return;
    }
    try {
      const { error } = await supabase
        .from('chat_sessions')
        .update({ title: newTitle })
        .eq('id', sessionId);
      if (error) throw error;
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: newTitle } : s));
      setRenamingId(null);
      toast.success("Session renamed");
    } catch (error) {
      console.error("Error renaming session:", error);
      toast.error("Failed to rename session");
    }
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-50 h-12 w-12 md:h-14 md:w-14 rounded-full bg-primary shadow-lg transition-transform duration-200 hover:scale-105"
      >
        {isOpen ? <X className="h-5 w-5 md:h-6 md:w-6" /> : <MessageSquare className="h-5 w-5 md:h-6 md:w-6" />}
      </Button>

      {isOpen && (
        <Card className="fixed bottom-24 right-4 z-50 flex h-[calc(100vh-120px)] w-[calc(100vw-32px)] flex-col border shadow-xl animate-in slide-in-from-bottom-5 sm:right-6 sm:h-[600px] sm:w-[400px] overflow-hidden overscroll-contain">
          <CardHeader className="border-b bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-muted-foreground"
                  onClick={() => setShowSessions(!showSessions)}
                >
                  <Menu className="h-5 w-5" />
                </Button>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                  <Bot className="h-6 w-6" />
                </div>
                <div className="overflow-hidden">
                  <CardTitle className="text-xs font-bold text-foreground truncate">
                    {sessions.find(s => s.id === currentSessionId)?.title || "SKY Second Brain"}
                  </CardTitle>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[9px] font-medium uppercase text-muted-foreground tracking-wider">Neural Core Active</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => handleNewChat()}
                  title="New session"
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-muted-foreground"
                  onClick={() => setIsOpen(false)}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex-1 min-h-0 bg-background p-0 relative flex overflow-hidden">
            {showSessions && (
              <div className="absolute inset-0 z-10 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="h-full w-3/4 border-r bg-card shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
                  <div className="p-3 border-b flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">History</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowSessions(false)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="p-2">
                    <Button 
                      className="w-full justify-start gap-2 h-9 text-xs font-medium mb-2" 
                      variant="outline"
                      onClick={() => handleNewChat()}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      New Chat
                    </Button>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-2 space-y-1">
                      {sessions.map((session) => (
                        <div
                          key={session.id}
                          className={cn(
                            "group flex items-center justify-between gap-1 p-2 rounded-md cursor-pointer transition-colors",
                            currentSessionId === session.id 
                              ? "bg-primary/10 text-primary border border-primary/20" 
                              : "hover:bg-secondary text-muted-foreground"
                          )}
                          onClick={() => {
                            if (renamingId === session.id) return;
                            setCurrentSessionId(session.id);
                            setShowSessions(false);
                          }}
                        >
                          <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                            <History className="h-3.5 w-3.5 shrink-0" />
                            {renamingId === session.id ? (
                              <form
                                onSubmit={(e) => saveRename(session.id, e)}
                                className="flex-1 min-w-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Input
                                  autoFocus
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onBlur={() => saveRename(session.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") setRenamingId(null);
                                  }}
                                  className="h-6 text-[11px] px-1.5"
                                />
                              </form>
                            ) : (
                              <span className="text-[11px] font-medium truncate">{session.title}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            {renamingId === session.id ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-emerald-500"
                                onClick={(e) => saveRename(session.id, e)}
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary"
                                onClick={(e) => startRename(session, e)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500"
                              onClick={(e) => handleDeleteSession(session.id, e)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
                <div className="flex-1 h-full" onClick={() => setShowSessions(false)} />
              </div>
            )}

            <ScrollArea 
              ref={scrollRef} 
              className="h-full w-full p-4 [&>[data-radix-scroll-area-viewport]]:overscroll-contain"
              type="always"
            >
              <div className="space-y-4">
                {messages.length === 0 && !isLoading && (
                  <div className="text-center py-8">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
                      <Bot className="h-8 w-8 text-primary" />
                    </div>
                    <p className="text-sm font-bold text-foreground">SKY Studio Second Brain</p>
                    <p className="mx-auto mt-2 max-w-[240px] text-[11px] text-muted-foreground leading-relaxed">
                      I have full access to your production pipeline. I can approve ideas, manage sources, and help you build your YouTube empire.
                    </p>
                    
                    <div className="mt-6 grid grid-cols-1 gap-2">
                       <Button 
                         variant="outline" 
                         size="sm" 
                         className="h-8 justify-start text-[10px] bg-slate-50/50"
                         onClick={() => setInput("Show me recent pending ideas")}
                       >
                         "Show me recent pending ideas"
                       </Button>
                       <Button 
                         variant="outline" 
                         size="sm" 
                         className="h-8 justify-start text-[10px] bg-slate-50/50"
                         onClick={() => setInput("Add a new YouTube channel source")}
                       >
                         "Add a new YouTube channel source"
                       </Button>
                       <Button 
                         variant="outline" 
                         size="sm" 
                         className="h-8 justify-start text-[10px] bg-slate-50/50"
                         onClick={() => setInput("How is the pipeline performing today?")}
                       >
                         "Check pipeline health"
                       </Button>
                    </div>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-3 max-w-[85%]",
                      msg.role === "user" ? "ml-auto flex-row-reverse" : ""
                    )}
                  >
                    <div className={cn(
                      "h-8 w-8 rounded-lg shrink-0 flex items-center justify-center shadow-sm",
                      msg.role === "user" ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground"
                    )}>
                      {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div className={cn(
                      "min-w-0 flex-1 rounded-2xl px-4 py-2.5 text-sm shadow-sm leading-relaxed break-words overflow-hidden [overflow-wrap:anywhere] [word-break:break-word]",
                      msg.role === "user"
                        ? "rounded-tr-none border bg-secondary text-secondary-foreground whitespace-pre-wrap"
                        : "rounded-tl-none border bg-card text-card-foreground"
                    )}>
                      {msg.role === "assistant" ? (
                        <div className="prose prose-sm max-w-none break-words [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-bold [&_h1]:mt-2 [&_h2]:mt-2 [&_h3]:mt-2 [&_a]:text-primary [&_a]:underline [&_a]:break-all [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_img]:rounded-lg [&_img]:my-2 [&_img]:max-w-full">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="rounded-2xl border bg-card px-4 py-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    </div>
                  </div>
                )}
              </div>
              <ScrollBar orientation="vertical" className="bg-slate-100/50" />
            </ScrollArea>
          </CardContent>

          <CardFooter className="border-t bg-card p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex w-full items-center space-x-2"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Talk to your second brain..."
                className="rounded-lg bg-background border-muted h-10 text-sm"
              />
              <Button 
                type="submit" 
                size="icon" 
                disabled={isLoading || !input.trim()}
                className="h-10 w-10 shrink-0 rounded-lg bg-primary shadow-lg shadow-primary/20"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardFooter>
        </Card>
      )}
    </>
  );
}

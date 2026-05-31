import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, Send, X, MessageSquare, Loader2, User, ChevronDown, Trash2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
}

export function AIChatAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      loadHistory();
    }
  }, [isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages, isLoading, isOpen]);

  const loadHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_chat_memory')
        .select('role, content')
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) throw error;
      if (data) {
        setMessages(data.map(m => ({ role: m.role as any, content: m.content })));
      }
    } catch (error) {
      console.error("Error loading history:", error);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { messages: newMessages },
      });

      if (error) throw error;

      if (data) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.content }]);
      }
    } catch (error: any) {
      console.error("AI Assistant Error:", error);
      toast.error("Failed to get response from AI: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { messages: [{ role: "user", content: "Please clear our chat memory." }] },
      });
      if (error) throw error;
      setMessages([]);
      toast.success("Chat history cleared");
    } catch (error: any) {
      toast.error("Failed to clear history: " + error.message);
    } finally {
      setIsLoading(false);
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
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                  <Bot className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-foreground">SKY Second Brain</CardTitle>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-medium uppercase text-muted-foreground tracking-wider">Neural Core Active</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-muted-foreground hover:text-rose-500"
                  onClick={handleClearChat}
                  title="Clear Chat Memory"
                >
                  <Trash2 className="h-4 w-4" />
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
            <div className="flex items-center gap-2 mt-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[9px] font-black text-primary uppercase tracking-widest border border-primary/20">Read/Write Access</span>
              <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[9px] font-black text-indigo-600 uppercase tracking-widest border border-indigo-500/20">Global History</span>
            </div>
          </CardHeader>

          <CardContent className="flex-1 bg-background p-0">
            <ScrollArea 
              ref={scrollRef} 
              className="h-full p-4 [&>[data-radix-scroll-area-viewport]]:overscroll-contain"
              type="always"
            >
              <div className="space-y-4">
                {messages.length === 0 && (
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
                      "rounded-2xl px-4 py-2.5 text-sm shadow-sm leading-relaxed",
                      msg.role === "user" 
                        ? "rounded-tr-none border bg-secondary text-secondary-foreground" 
                        : "rounded-tl-none border bg-card text-card-foreground"
                    )}>
                      {msg.content}
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


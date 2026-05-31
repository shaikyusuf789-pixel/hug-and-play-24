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

  return (
    <>
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl z-50 gradient-primary hover:scale-105 transition-transform duration-200"
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
      </Button>

      {isOpen && (
        <Card className="fixed bottom-24 right-4 sm:right-6 w-[calc(100vw-32px)] sm:w-[400px] h-[calc(100vh-120px)] sm:h-[600px] flex flex-col shadow-2xl z-50 border-indigo-100 animate-in slide-in-from-bottom-5">
          <CardHeader className="p-4 border-b bg-indigo-50/30">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-slate-900">SKY AI Assistant</CardTitle>
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Memory Active & Ready</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 mt-2">
              <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">Second Brain Enabled</span>
            </div>
          </CardHeader>

          <CardContent className="flex-1 p-0 bg-white">
            <ScrollArea ref={scrollRef} className="h-full p-4">
              <div className="space-y-4">
                {messages.length === 0 && (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-4">
                      <Bot className="h-8 w-8 text-indigo-500" />
                    </div>
                    <p className="text-sm text-slate-500 font-medium">Hello! How can I help you today?</p>
                    <p className="text-[11px] text-slate-400 mt-1 max-w-[200px] mx-auto">I can search for ideas, edit content, and check channel performance.</p>
                    
                    <div className="mt-6 grid grid-cols-1 gap-2">
                       <Button 
                         variant="outline" 
                         size="sm" 
                         className="text-[10px] h-8 justify-start border-slate-100 hover:bg-slate-50"
                         onClick={() => setInput("What are the ssc related new ideas in our pending list?")}
                       >
                         "Show me SSC related pending ideas"
                       </Button>
                       <Button 
                         variant="outline" 
                         size="sm" 
                         className="text-[10px] h-8 justify-start border-slate-100 hover:bg-slate-50"
                         onClick={() => setInput("Which channels have high rejection rates?")}
                       >
                         "Check channel performance"
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
                      msg.role === "user" ? "bg-slate-100 text-slate-600" : "bg-indigo-600 text-white"
                    )}>
                      {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div className={cn(
                      "rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                      msg.role === "user" 
                        ? "bg-slate-50 text-slate-800 rounded-tr-none border border-slate-100" 
                        : "bg-white text-slate-800 rounded-tl-none border border-indigo-50"
                    )}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-3">
                    <div className="h-8 w-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="bg-slate-50 rounded-2xl px-4 py-2 text-sm border border-slate-100">
                      <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>

          <CardFooter className="p-4 border-t bg-slate-50/50">
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
                placeholder="Ask anything..."
                className="bg-white border-slate-200 focus-visible:ring-indigo-500 rounded-xl"
              />
              <Button 
                type="submit" 
                size="icon" 
                disabled={isLoading || !input.trim()}
                className="rounded-xl gradient-primary shadow-lg shadow-indigo-100 h-10 w-10 shrink-0"
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

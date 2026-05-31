import { createFileRoute } from "@tanstack/react-router";
import { Settings, User, Shield, Bell, Globe, Zap, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_dashboard/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-black bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded uppercase tracking-[0.2em] border border-white/5 backdrop-blur-md">Configuration</span>
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight">System Settings</h1>
        <p className="text-slate-400 mt-1 font-medium">Configure your AI engine providers and global preferences.</p>
      </div>

      <div className="grid gap-6">
        <Card className="rounded-[2.5rem] border border-white/10 shadow-2xl shadow-black/40 overflow-hidden bg-white/5 backdrop-blur-2xl">
          <CardHeader className="p-6 border-b border-white/5 bg-white/[0.01] flex flex-row items-center gap-3">
            <Zap className="h-4 w-4 text-indigo-400" />
            <CardTitle className="font-black text-white uppercase tracking-widest text-sm">API Credentials</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-200 text-sm">
              <p className="font-black mb-1 uppercase tracking-wider text-[11px]">Managed via Supabase Secrets</p>
              <p className="text-slate-400 font-medium">API keys for OpenAI, Apify, ElevenLabs, and Google are securely stored in your Supabase project's Edge Function secrets. You do not need to enter them here.</p>
            </div>
            <div className="grid gap-2 opacity-50 pointer-events-none">
              <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">OpenAI API Key (Stored in Supabase)</Label>
              <Input type="password" value="••••••••••••••••" readOnly className="h-12 rounded-xl border-white/10 bg-black/20 text-white" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2.5rem] border border-white/10 shadow-2xl shadow-black/40 overflow-hidden bg-white/5 backdrop-blur-2xl">
          <CardHeader className="p-6 border-b border-white/5 bg-white/[0.01] flex flex-row items-center gap-3">
            <Bell className="h-4 w-4 text-indigo-400" />
            <CardTitle className="font-black text-white uppercase tracking-widest text-sm">Notifications</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-black text-white uppercase tracking-tight">Email Alerts</div>
                <div className="text-xs text-slate-500 font-medium">Get notified when a manual run completes.</div>
              </div>
              <Switch />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-black text-white uppercase tracking-tight">Telegram Bot</div>
                <div className="text-xs text-slate-500 font-medium">Daily reports sent to your Telegram.</div>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" className="h-12 px-8 rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10 font-black uppercase tracking-widest text-[11px] transition-all">Reset</Button>
          <Button className="h-12 px-8 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-[11px] gap-3 shadow-button hover:shadow-white-lg transition-all hover:scale-105 active:scale-95">
            <Save className="h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}

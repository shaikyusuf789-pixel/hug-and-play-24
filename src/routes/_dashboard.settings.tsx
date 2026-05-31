import { createFileRoute } from "@tanstack/react-router";
import { Settings, User, Shield, Bell, Globe, Zap, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_dashboard/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase tracking-wider">Configuration</span>
        </div>
        <h1 className="text-3xl font-bold text-slate-900">System Settings</h1>
        <p className="text-slate-500 mt-1">Configure your AI engine providers and global preferences.</p>
      </div>

      <div className="grid gap-6">
        <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
          <div className="p-6 border-b bg-slate-50/50 flex items-center gap-2">
            <Zap className="h-4 w-4 text-indigo-500" />
            <h3 className="font-bold text-slate-900">API Credentials</h3>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid gap-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-slate-400">Anthropic API Key</Label>
              <Input type="password" placeholder="sk-ant-..." className="h-11 rounded-xl border-slate-200" />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-slate-400">OpenAI API Key</Label>
              <Input type="password" placeholder="sk-..." className="h-11 rounded-xl border-slate-200" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
          <div className="p-6 border-b bg-slate-50/50 flex items-center gap-2">
            <Bell className="h-4 w-4 text-indigo-500" />
            <h3 className="font-bold text-slate-900">Notifications</h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900">Email Alerts</div>
                <div className="text-xs text-slate-500">Get notified when a manual run completes.</div>
              </div>
              <Switch />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900">Telegram Bot</div>
                <div className="text-xs text-slate-500">Daily reports sent to your Telegram.</div>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" className="h-11 px-8 rounded-2xl border-slate-200 font-bold uppercase tracking-widest text-xs">Reset</Button>
          <Button className="h-11 px-8 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold uppercase tracking-widest text-xs gap-2">
            <Save className="h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

// ── Types ────────────────────────────────────────────────────

interface BotStatus {
  bot: { id: number; username?: string; first_name: string } | null;
  bot_ok: boolean;
  webhook: Record<string, unknown> | null;
  webhook_ok: boolean;
  admin_chat_id: string;
  bot_enabled: boolean;
}

interface BotConfig {
  bot_token_masked: string;
  has_token: boolean;
  has_secret: boolean;
  admin_chat_id: string;
  bot_enabled: boolean;
}

interface Conversation {
  id: number;
  chat_id: string;
  chat_type: string;
  title: string;
  username: string;
  first_name: string;
  last_name: string;
  is_admin_chat: number;
  unread_count: number;
  last_message_text: string;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

interface TgMessage {
  id: number;
  chat_id: string;
  message_id: number | null;
  direction: "in" | "out";
  message_type: string;
  text: string;
  file_id: string;
  caption: string;
  raw_data: string | null;
  sent_at: string;
}

interface BotProfile {
  name: string;
  description: string;
  short_description: string;
}

interface BotCommand {
  command: string;
  description: string;
}

interface Stats {
  total_conversations: number;
  total_messages: number;
  messages_today: number;
}

type Tab = "overview" | "conversations" | "configuration" | "guide";

const API = "/api/admin/telegram";

// ── Component ────────────────────────────────────────────────

export default function TelegramAdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);

  // Overview state
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  // Conversations state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<TgMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const lastMsgIdRef = useRef<number>(0);
  const isAtBottomRef = useRef(true);

  // Configuration state
  const [, setConfig] = useState<BotConfig | null>(null);
  const [botProfile, setBotProfile] = useState<BotProfile>({ name: "", description: "", short_description: "" });
  const [botCommands, setBotCommands] = useState<BotCommand[]>([{ command: "", description: "" }]);
  const [commandScope, setCommandScope] = useState("default");
  const [cfgToken, setCfgToken] = useState("");
  const [cfgSecret, setCfgSecret] = useState("");
  const [cfgAdminChat, setCfgAdminChat] = useState("");
  const [cfgEnabled, setCfgEnabled] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookMaxConn, setWebhookMaxConn] = useState(40);
  const [webhookAllowedUpdates, setWebhookAllowedUpdates] = useState<string[]>(["message", "callback_query", "inline_query"]);
  const [webhookInfoJson, setWebhookInfoJson] = useState("");

  // Test state
  const [testChatId, setTestChatId] = useState("");
  const [testText, setTestText] = useState("");

  // Detect chat ID state
  const [detecting, setDetecting] = useState(false);

  // ── Fetch functions ──────────────────────────────────────

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, statsRes, configRes] = await Promise.all([
        fetch(`${API}?action=get_bot_status`),
        fetch(`${API}?action=get_stats`),
        fetch(`${API}?action=get_config`),
      ]);
      const s = await statusRes.json();
      const st = await statsRes.json();
      const c = await configRes.json();
      if (s.status === "success") {
        setBotStatus({
          bot: s.bot,
          bot_ok: s.bot_ok,
          webhook: s.webhook,
          webhook_ok: s.webhook_ok,
          admin_chat_id: s.admin_chat_id,
          bot_enabled: s.bot_enabled,
        });
      }
      if (st.status === "success") setStats(st);
      if (c.status === "success") {
        setConfig(c.config);
        setCfgAdminChat(c.config.admin_chat_id || "");
        setCfgEnabled(c.config.bot_enabled);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams({ action: "get_conversations" });
      if (searchQuery) params.set("search", searchQuery);
      if (unreadOnly) params.set("unread_only", "1");
      const res = await fetch(`${API}?${params}`);
      const data = await res.json();
      if (data.status === "success") setConversations(data.conversations || []);
    } catch { /* silent */ }
  }, [searchQuery, unreadOnly]);

  const fetchMessages = useCallback(async (chatId: string) => {
    try {
      const res = await fetch(`${API}?action=get_messages&chat_id=${encodeURIComponent(chatId)}`);
      const data = await res.json();
      if (data.status === "success") {
        const msgs = data.messages || [];
        setChatMessages(msgs);
        if (msgs.length > 0) lastMsgIdRef.current = msgs[msgs.length - 1].id;
      }
    } catch { /* silent */ }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const [configRes, profileRes, commandsRes, webhookRes] = await Promise.all([
        fetch(`${API}?action=get_config`),
        fetch(`${API}?action=get_bot_profile`),
        fetch(`${API}?action=get_bot_commands&scope=${commandScope}`),
        fetch(`${API}?action=get_webhook_settings`),
      ]);
      const c = await configRes.json();
      const p = await profileRes.json();
      const cmd = await commandsRes.json();
      const wh = await webhookRes.json();

      if (c.status === "success") {
        setConfig(c.config);
        setCfgToken(c.config.bot_token_masked || "");
        setCfgAdminChat(c.config.admin_chat_id || "");
        setCfgEnabled(c.config.bot_enabled);
      }
      if (p.status === "success") {
        setBotProfile({ name: p.name || "", description: p.description || "", short_description: p.short_description || "" });
      }
      if (cmd.status === "success") {
        setBotCommands(cmd.commands?.length > 0 ? cmd.commands : [{ command: "", description: "" }]);
      }
      if (wh.status === "success") {
        setWebhookMaxConn(wh.max_connections || 40);
        setWebhookAllowedUpdates(wh.allowed_updates || []);
        setWebhookUrl(wh.webhook_url || "");
        setWebhookInfoJson(JSON.stringify(wh, null, 2));
      }
    } catch { /* silent */ }
  }, [commandScope]);

  // ── Effects ──────────────────────────────────────────────

  useEffect(() => {
    if (tab === "overview") fetchOverview();
    else if (tab === "conversations") fetchConversations();
    else if (tab === "configuration") fetchConfig();
  }, [tab, fetchOverview, fetchConversations, fetchConfig]);

  useEffect(() => {
    if (selectedChatId) {
      fetchMessages(selectedChatId);
      lastMsgIdRef.current = 0;
      setNewMsgCount(0);
      // Mark as read
      fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_read", chat_id: selectedChatId }),
      }).catch(() => {});
    }
  }, [selectedChatId, fetchMessages]);

  // Poll conversations list
  useEffect(() => {
    if (tab !== "conversations") return;
    const interval = setInterval(() => {
      if (document.visibilityState !== "hidden") fetchConversations();
    }, 15000);
    return () => clearInterval(interval);
  }, [tab, fetchConversations]);

  // ── Actions ──────────────────────────────────────────────

  async function sendCsrf(body: Record<string, unknown>) {
    return fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function toggleBot() {
    try {
      const res = await sendCsrf({ action: "save_config", bot_enabled: !cfgEnabled });
      const data = await res.json();
      if (data.status === "success") {
        setCfgEnabled(!cfgEnabled);
        fetchOverview();
      }
    } catch { /* silent */ }
  }

  async function sendTestMessage() {
    if (!testText.trim()) return;
    try {
      const res = await sendCsrf({ action: "test_send", chat_id: testChatId || undefined, text: testText });
      const data = await res.json();
      if (data.status === "success") {
        setTestText("");
        alert("Message sent!");
      } else {
        alert(data.message || "Failed");
      }
    } catch { alert("Failed to send"); }
  }

  async function sendMessage() {
    if (!newMessage.trim() || !selectedChatId) return;
    setSendingMsg(true);
    try {
      await sendCsrf({ action: "send_message", chat_id: selectedChatId, text: newMessage.trim() });
      setNewMessage("");
      fetchMessages(selectedChatId);
    } catch { /* silent */ }
    setSendingMsg(false);
  }

  async function deleteConversation() {
    if (!selectedChatId || !confirm("Clear all messages for this conversation?")) return;
    try {
      await sendCsrf({ action: "delete_conversation", chat_id: selectedChatId });
      setChatMessages([]);
    } catch { /* silent */ }
  }

  async function saveConfig() {
    try {
      const res = await sendCsrf({
        action: "save_config",
        bot_token: cfgToken,
        secret_token: cfgSecret,
        admin_chat_id: cfgAdminChat,
        bot_enabled: cfgEnabled,
      });
      const data = await res.json();
      alert(data.message || (data.status === "success" ? "Saved!" : "Failed"));
      if (data.status === "success") {
        setCfgSecret("");
        fetchConfig();
      }
    } catch { alert("Failed to save"); }
  }

  async function saveBotProfile() {
    try {
      const res = await sendCsrf({ action: "save_bot_profile", ...botProfile });
      const data = await res.json();
      alert(data.message || (data.status === "success" ? "Saved!" : "Failed"));
    } catch { alert("Failed to save"); }
  }

  async function fetchProfileFromTelegram() {
    try {
      const res = await fetch(`${API}?action=get_bot_profile`);
      const data = await res.json();
      if (data.status === "success") {
        setBotProfile({ name: data.name || "", description: data.description || "", short_description: data.short_description || "" });
      }
    } catch { /* silent */ }
  }

  async function saveBotCommands() {
    const validCommands = botCommands.filter((c) => c.command.trim() && c.description.trim());
    if (validCommands.length === 0) {
      alert("Add at least one command.");
      return;
    }
    try {
      const res = await sendCsrf({ action: "save_bot_commands", commands: validCommands, scope: commandScope });
      const data = await res.json();
      alert(data.message || (data.status === "success" ? "Saved!" : "Failed"));
    } catch { alert("Failed to save"); }
  }

  async function loadCommandsFromTelegram() {
    try {
      const res = await fetch(`${API}?action=get_bot_commands&scope=${commandScope}`);
      const data = await res.json();
      if (data.status === "success") {
        setBotCommands(data.commands?.length > 0 ? data.commands : [{ command: "", description: "" }]);
      }
    } catch { /* silent */ }
  }

  async function setWebhook() {
    const url = prompt("Enter webhook URL:", webhookUrl || `${window.location.origin}/api/telegram/webhook`);
    if (!url) return;
    try {
      const res = await sendCsrf({ action: "set_webhook", webhook_url: url });
      const data = await res.json();
      alert(data.message || (data.status === "success" ? "Done!" : "Failed"));
      fetchConfig();
    } catch { alert("Failed"); }
  }

  async function deleteWebhook() {
    if (!confirm("Remove the webhook?")) return;
    try {
      const res = await sendCsrf({ action: "delete_webhook" });
      const data = await res.json();
      alert(data.message || "Done");
      fetchConfig();
    } catch { alert("Failed"); }
  }

  async function saveWebhookSettings() {
    try {
      const res = await sendCsrf({
        action: "save_webhook_settings",
        max_connections: webhookMaxConn,
        allowed_updates: webhookAllowedUpdates,
      });
      const data = await res.json();
      alert(data.message || (data.status === "success" ? "Saved!" : "Failed"));
    } catch { alert("Failed"); }
  }

  async function detectChatId() {
    setDetecting(true);
    try {
      const res = await sendCsrf({ action: "detect_chat_id" });
      const data = await res.json();
      if (data.status === "ok") {
        setCfgAdminChat(data.chat_id);
        alert(`Detected: ${data.from_name} (${data.chat_id})`);
      } else {
        alert(data.message || "No message found. Send /id to your bot first.");
      }
    } catch { alert("Detection failed"); }
    setDetecting(false);
  }

  async function getFileUrl(fileId: string): Promise<string | null> {
    try {
      const res = await fetch(`${API}?action=get_file_url&file_id=${encodeURIComponent(fileId)}`);
      const data = await res.json();
      return data.status === "success" ? data.url : null;
    } catch {
      return null;
    }
  }

  // ── Helpers ──────────────────────────────────────────────

  function getConvDisplayName(conv: Conversation): string {
    const name = `${conv.first_name || ""} ${conv.last_name || ""}`.trim();
    return name || conv.username ? `@${conv.username}` : conv.chat_id;
  }

  function getConvInitial(conv: Conversation): string {
    const name = `${conv.first_name || ""} ${conv.last_name || ""}`.trim();
    if (name) return name.charAt(0).toUpperCase();
    if (conv.username) return conv.username.charAt(0).toUpperCase();
    return "#";
  }

  function toggleAllowedUpdate(update: string) {
    setWebhookAllowedUpdates((prev) =>
      prev.includes(update) ? prev.filter((u) => u !== update) : [...prev, update]
    );
  }

  // ── Media Renderer ───────────────────────────────────────

  function MediaRenderer({ msg }: { msg: TgMessage }) {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
      if (msg.file_id && msg.message_type !== "text") {
        getFileUrl(msg.file_id).then(setUrl);
      }
    }, [msg.file_id, msg.message_type]);

    if (msg.message_type === "text" || !msg.message_type) return null;

    const icons: Record<string, string> = { photo: "📷", audio: "🎵", video: "🎬", document: "📄", voice: "🎙️", video_note: "📹", sticker: "🎨", animation: "🎞️" };
    const labels: Record<string, string> = { photo: "Photo", audio: "Audio", video: "Video", document: "Document", voice: "Voice", video_note: "Video Note", sticker: "Sticker", animation: "GIF" };

    if (msg.message_type === "photo" && url) {
      return (
        <div className="mb-1">
          <img src={url} alt="Photo" className="max-w-[220px] max-h-[240px] rounded-lg object-cover cursor-pointer" loading="lazy" onClick={() => window.open(url, "_blank")} />
          {msg.caption && <p className="text-xs mt-1 opacity-80">{msg.caption}</p>}
        </div>
      );
    }

    if (msg.message_type === "audio" && url) {
      return (
        <div className="mb-1">
          <audio controls preload="none" className="w-[240px] h-[36px]"><source src={url} /></audio>
          {msg.caption && <p className="text-xs mt-1 opacity-80">{msg.caption}</p>}
        </div>
      );
    }

    if (msg.message_type === "video" && url) {
      return (
        <div className="mb-1">
          <video controls preload="none" className="max-w-[260px] max-h-[200px] rounded-lg"><source src={url} /></video>
          {msg.caption && <p className="text-xs mt-1 opacity-80">{msg.caption}</p>}
        </div>
      );
    }

    if (msg.message_type === "voice" && url) {
      return (
        <div className="mb-1">
          <audio controls preload="none" className="w-[240px] h-[36px]"><source src={url} /></audio>
        </div>
      );
    }

    if (msg.message_type === "document" && url) {
      return (
        <div className="mb-1">
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-high px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container-alt">
            📄 {msg.text || "Document"}
          </a>
        </div>
      );
    }

    return (
      <div className="mb-1 flex items-center gap-1.5 text-xs opacity-70 italic">
        <span>{icons[msg.message_type] ?? "📎"}</span>
        <span>{labels[msg.message_type] ?? msg.message_type}</span>
        {msg.caption && <span className="not-italic">— {msg.caption}</span>}
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "conversations", label: "Conversations" },
    { key: "configuration", label: "Configuration" },
    { key: "guide", label: "Setup Guide" },
  ];

  if (loading && tab === "overview") {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-on-surface">Telegram Bot</h1>
        <p className="text-on-surface-variant">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-on-surface">Telegram Bot</h1>
        <div className="flex items-center gap-3">
          <Button variant={cfgEnabled ? "danger" : "primary"} onClick={toggleBot}>
            {cfgEnabled ? "Disable Bot" : "Enable Bot"}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-outline-variant pb-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t.key
                ? "bg-surface-container text-on-surface border border-outline-variant border-b-transparent -mb-px"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ─────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-2xl font-bold">{botStatus?.bot?.first_name || "—"}</p>
                <p className="text-xs text-on-surface-variant">Bot Name</p>
                <Badge variant={botStatus?.bot_ok ? "success" : "error"} className="mt-1">
                  {botStatus?.bot_ok ? "Connected" : "Not Connected"}
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-lg font-bold truncate">{botStatus?.webhook_ok ? "Active" : "None"}</p>
                <p className="text-xs text-on-surface-variant">Webhook</p>
                <Badge variant={botStatus?.webhook_ok ? "success" : "warning"} className="mt-1">
                  {botStatus?.webhook_ok ? "Registered" : "Not Set"}
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-2xl font-bold">{stats?.total_conversations ?? "—"}</p>
                <p className="text-xs text-on-surface-variant">Total Conversations</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-2xl font-bold">{stats?.messages_today ?? "—"}</p>
                <p className="text-xs text-on-surface-variant">Messages Today</p>
                <p className="text-xs text-on-surface-variant mt-1">{stats?.total_messages ?? 0} total</p>
              </CardContent>
            </Card>
          </div>

          {/* Admin Chat & Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm text-on-surface-variant">Admin Chat ID</CardTitle></CardHeader>
              <CardContent>
                <p className="font-mono text-sm">{botStatus?.admin_chat_id || "Not set"}</p>
                <Badge variant={cfgEnabled ? "success" : "error"} className="mt-2">
                  {cfgEnabled ? "Bot Enabled" : "Bot Disabled"}
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm text-on-surface-variant">Webhook URL</CardTitle></CardHeader>
              <CardContent>
                <p className="font-mono text-xs break-all">{(botStatus?.webhook as Record<string, unknown>)?.url as string || "Not set"}</p>
                {String((botStatus?.webhook as Record<string, unknown>)?.last_error_message || "") && (botStatus?.webhook as Record<string, unknown>)?.last_error_message ? (
                  <p className="text-xs text-red-500 mt-2">
                    Error: {String((botStatus?.webhook as Record<string, unknown>)?.last_error_message)}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>

          {/* Quick Test */}
          <Card>
            <CardHeader><CardTitle>Quick Test</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3">
                <Input
                  placeholder="Chat ID (leave empty for admin)"
                  value={testChatId}
                  onChange={(e) => setTestChatId(e.target.value)}
                />
                <Input
                  placeholder="Test message..."
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") sendTestMessage(); }}
                />
                <Button onClick={sendTestMessage}>Send</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Conversations Tab ────────────────────────────── */}
      {tab === "conversations" && (
        <div className="space-y-4">
          {/* Search & Filter */}
          <div className="flex gap-3 items-center">
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
            <button
              onClick={() => setUnreadOnly(!unreadOnly)}
              className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                unreadOnly
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-outline-variant text-on-surface-variant hover:text-on-surface"
              }`}
            >
              Unread only
            </button>
            <Button variant="secondary" size="sm" onClick={fetchConversations}>Refresh</Button>
          </div>

          {/* Split Layout: Conversations + Chat */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6" style={{ minHeight: "600px" }}>
            {/* Conversation List */}
            <Card padding="none" className="lg:col-span-2">
              <CardContent className="p-0">
                {conversations.length === 0 ? (
                  <p className="text-on-surface-variant text-sm py-8 text-center">No conversations.</p>
                ) : (
                  <div className="max-h-[580px] overflow-y-auto">
                    {conversations.map((c) => (
                      <button
                        key={c.chat_id}
                        onClick={() => setSelectedChatId(c.chat_id)}
                        className={`w-full text-left p-4 transition-colors border-b border-outline-variant/30 ${
                          selectedChatId === c.chat_id
                            ? "bg-primary/10 border-l-4 border-l-primary"
                            : "hover:bg-surface-container-high"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                            {getConvInitial(c)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between items-center">
                              <span className="font-medium text-sm truncate">{getConvDisplayName(c)}</span>
                              {c.unread_count > 0 && (
                                <Badge variant="info" className="shrink-0">{c.unread_count}</Badge>
                              )}
                            </div>
                            <p className="text-xs text-on-surface-variant truncate mt-0.5">
                              {c.last_message_text || "No messages"}
                            </p>
                            <p className="text-[10px] text-on-surface-variant mt-0.5">
                              {c.last_message_at ? new Date(c.last_message_at).toLocaleString("en-MY") : ""}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Chat Viewer */}
            <Card padding="none" className="lg:col-span-3">
              <CardHeader className="px-6 pt-4 flex flex-row items-center justify-between">
                <CardTitle className="text-base">
                  {selectedChatId
                    ? `Chat: ${conversations.find((c) => c.chat_id === selectedChatId) ? getConvDisplayName(conversations.find((c) => c.chat_id === selectedChatId)!) : selectedChatId}`
                    : "Select a conversation"}
                </CardTitle>
                {selectedChatId && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={deleteConversation}>Clear</Button>
                    <button onClick={() => setSelectedChatId(null)} className="text-on-surface-variant hover:text-red-500 text-sm px-2">✕</button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="px-6 pb-6">
                {!selectedChatId ? (
                  <p className="text-on-surface-variant text-sm py-8 text-center">Click a conversation to view messages.</p>
                ) : (
                  <div className="space-y-3">
                    {/* Messages */}
                    <div className="relative">
                      <div
                        ref={chatContainerRef}
                        className="max-h-[420px] overflow-y-auto space-y-2 border border-outline-variant rounded-lg p-3"
                        onScroll={() => {
                          if (chatContainerRef.current) {
                            const el = chatContainerRef.current;
                            isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
                            if (isAtBottomRef.current) setNewMsgCount(0);
                          }
                        }}
                      >
                        {chatMessages.map((m) => (
                          <div key={m.id} className={`text-sm ${m.direction === "in" ? "text-left" : "text-right"}`}>
                            <MediaRenderer msg={m} />
                            {m.text && (
                              <span className={`inline-block px-3 py-1.5 rounded-lg max-w-[80%] break-words whitespace-pre-wrap text-left ${
                                m.direction === "in"
                                  ? "bg-surface-container-high text-on-surface"
                                  : "bg-primary/20 text-on-surface"
                              }`}>
                                {m.text}
                              </span>
                            )}
                            <p className="text-[10px] text-on-surface-variant mt-0.5">
                              {new Date(m.sent_at).toLocaleString("en-MY")}
                            </p>
                          </div>
                        ))}
                        <div ref={chatEndRef} />
                      </div>
                      {newMsgCount > 0 && (
                        <button
                          onClick={() => {
                            chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
                            setNewMsgCount(0);
                          }}
                          className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-primary text-primary-foreground text-xs px-4 py-1.5 shadow-lg hover:bg-primary/90 transition-colors animate-bounce"
                        >
                          {newMsgCount} new message{newMsgCount > 1 ? "s" : ""} ↓
                        </button>
                      )}
                    </div>
                    {/* Send */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                        placeholder="Type a message..."
                        className="flex-1 rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                      />
                      <Button size="sm" onClick={sendMessage} loading={sendingMsg}>Send</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── Configuration Tab ────────────────────────────── */}
      {tab === "configuration" && (
        <div className="space-y-6">
          {/* Bot Profile */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Bot Profile</CardTitle>
                <Button variant="secondary" size="sm" onClick={fetchProfileFromTelegram}>Fetch from Telegram</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input label="Bot Name" value={botProfile.name} onChange={(e) => setBotProfile({ ...botProfile, name: e.target.value })} maxLength={64} />
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1">Description ({botProfile.description.length}/512)</label>
                <textarea value={botProfile.description} onChange={(e) => setBotProfile({ ...botProfile, description: e.target.value })} maxLength={512} rows={3} className="w-full rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1">Short Description ({botProfile.short_description.length}/120)</label>
                <textarea value={botProfile.short_description} onChange={(e) => setBotProfile({ ...botProfile, short_description: e.target.value })} maxLength={120} rows={2} className="w-full rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none resize-none" />
              </div>
              <Button onClick={saveBotProfile}>Save Profile</Button>
            </CardContent>
          </Card>

          {/* Bot Commands */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Bot Commands</CardTitle>
                <div className="flex gap-2 items-center">
                  <select value={commandScope} onChange={(e) => setCommandScope(e.target.value)} className="rounded-lg border border-outline-variant bg-surface-container px-2 py-1 text-sm text-on-surface">
                    <option value="default">Default</option>
                    <option value="all_private_chats">Private Chats</option>
                    <option value="all_group_chats">Group Chats</option>
                    <option value="all_chat_administrators">Admins</option>
                  </select>
                  <Button variant="secondary" size="sm" onClick={loadCommandsFromTelegram}>Load from Telegram</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {botCommands.map((cmd, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="command"
                    value={cmd.command}
                    onChange={(e) => {
                      const updated = [...botCommands];
                      updated[i] = { ...updated[i], command: e.target.value };
                      setBotCommands(updated);
                    }}
                    className="w-40 rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="description"
                    value={cmd.description}
                    onChange={(e) => {
                      const updated = [...botCommands];
                      updated[i] = { ...updated[i], description: e.target.value };
                      setBotCommands(updated);
                    }}
                    className="flex-1 rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                  />
                  <button
                    onClick={() => setBotCommands(botCommands.filter((_, j) => j !== i))}
                    className="text-red-500 hover:text-red-700 px-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setBotCommands([...botCommands, { command: "", description: "" }])}>
                  + Add Command
                </Button>
                <Button size="sm" onClick={saveBotCommands}>Save Commands</Button>
              </div>
            </CardContent>
          </Card>

          {/* Bot Credentials */}
          <Card>
            <CardHeader><CardTitle>Bot Credentials</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input label="Bot Token" type="password" placeholder="Enter bot token from BotFather" value={cfgToken} onChange={(e) => setCfgToken(e.target.value)} />
              <Input label="Webhook Secret" type="password" placeholder="Auto-generated on set_webhook" value={cfgSecret} onChange={(e) => setCfgSecret(e.target.value)} />
              <div className="flex gap-2 items-end">
                <Input label="Admin Chat ID" placeholder="Your Telegram chat ID" value={cfgAdminChat} onChange={(e) => setCfgAdminChat(e.target.value)} className="flex-1" />
                <Button variant="secondary" onClick={detectChatId} loading={detecting} className="mb-px">Detect</Button>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={cfgEnabled} onChange={(e) => setCfgEnabled(e.target.checked)} />
                Bot Enabled
              </label>
              <Button onClick={saveConfig}>Save Configuration</Button>
            </CardContent>
          </Card>

          {/* Webhook Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Webhook</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" onClick={setWebhook}>Set Webhook</Button>
                  <Button size="sm" variant="danger" onClick={deleteWebhook}>Remove</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1">Current URL</label>
                <p className="font-mono text-xs text-on-surface-variant break-all">{webhookUrl || "Not set"}</p>
              </div>
              <Input label="Max Connections (1–100)" type="number" value={String(webhookMaxConn)} onChange={(e) => setWebhookMaxConn(Math.max(1, Math.min(100, Number(e.target.value) || 40)))} />
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1">Allowed Updates</label>
                <div className="flex flex-wrap gap-2">
                  {["message", "edited_message", "channel_post", "callback_query", "inline_query", "poll"].map((u) => (
                    <label key={u} className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" checked={webhookAllowedUpdates.includes(u)} onChange={() => toggleAllowedUpdate(u)} />
                      {u}
                    </label>
                  ))}
                </div>
              </div>
              <Button onClick={saveWebhookSettings}>Save Webhook Settings</Button>
              {webhookInfoJson && (
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-1">Webhook Info (raw)</label>
                  <pre className="text-xs bg-surface-container-high p-3 rounded-lg overflow-x-auto max-h-40 text-on-surface-variant">
                    {webhookInfoJson}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Setup Guide Tab ──────────────────────────────── */}
      {tab === "guide" && (
        <Card>
          <CardHeader><CardTitle>Telegram Bot Setup Guide</CardTitle></CardHeader>
          <CardContent className="space-y-6 text-sm text-on-surface">
            <div className="space-y-2">
              <h3 className="font-bold text-base">Step 1: Create a Bot</h3>
              <ol className="list-decimal ml-5 space-y-1 text-on-surface-variant">
                <li>Open Telegram and search for <code className="bg-surface-container-high px-1 rounded">@BotFather</code></li>
                <li>Send <code className="bg-surface-container-high px-1 rounded">/newbot</code></li>
                <li>Follow the prompts to set a name and username</li>
                <li>Copy the <b>bot token</b> (looks like <code className="bg-surface-container-high px-1 rounded">123456:ABC-DEF...</code>)</li>
              </ol>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-base">Step 2: Configure the Bot</h3>
              <ol className="list-decimal ml-5 space-y-1 text-on-surface-variant">
                <li>Go to the <b>Configuration</b> tab above</li>
                <li>Paste the bot token in <b>Bot Token</b></li>
                <li>Click <b>Save Configuration</b></li>
              </ol>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-base">Step 3: Get Your Chat ID</h3>
              <ol className="list-decimal ml-5 space-y-1 text-on-surface-variant">
                <li>Open your bot in Telegram (click the link from BotFather)</li>
                <li>Send <code className="bg-surface-container-high px-1 rounded">/id</code> to the bot</li>
                <li>Copy the chat ID from the bot reply</li>
                <li>Or use the <b>Detect</b> button in the Configuration tab</li>
              </ol>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-base">Step 4: Set Admin Chat ID</h3>
              <ol className="list-decimal ml-5 space-y-1 text-on-surface-variant">
                <li>In the Configuration tab, paste your chat ID in <b>Admin Chat ID</b></li>
                <li>Click <b>Save Configuration</b></li>
              </ol>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-base">Step 5: Register Webhook</h3>
              <ol className="list-decimal ml-5 space-y-1 text-on-surface-variant">
                <li>In the Configuration tab, click <b>Set Webhook</b></li>
                <li>Enter your webhook URL: <code className="bg-surface-container-high px-1 rounded break-all">{typeof window !== "undefined" ? window.location.origin : ""}/api/telegram/webhook</code></li>
                <li>A secret token is auto-generated for security</li>
              </ol>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-base">Step 6: Enable & Test</h3>
              <ol className="list-decimal ml-5 space-y-1 text-on-surface-variant">
                <li>Enable the bot using the toggle at the top</li>
                <li>Send a message to your bot on Telegram</li>
                <li>Check the <b>Conversations</b> tab to see messages</li>
                <li>Use <b>Quick Test</b> in the Overview to send a test message</li>
              </ol>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-base">Bot Commands (Optional)</h3>
              <p className="text-on-surface-variant">Use the <b>Configuration</b> tab to set up bot commands. These show when users type <code className="bg-surface-container-high px-1 rounded">/</code> in the chat. Common commands:</p>
              <ul className="list-disc ml-5 space-y-1 text-on-surface-variant">
                <li><code className="bg-surface-container-high px-1 rounded">/start</code> — Welcome message</li>
                <li><code className="bg-surface-container-high px-1 rounded">/help</code> — Show available commands</li>
                <li><code className="bg-surface-container-high px-1 rounded">/id</code> — Get chat ID</li>
                <li><code className="bg-surface-container-high px-1 rounded">/orders</code> — Last 5 orders (admin)</li>
                <li><code className="bg-surface-container-high px-1 rounded">/status</code> — Bot status (admin)</li>
                <li><code className="bg-surface-container-high px-1 rounded">/stats</code> — Statistics (admin)</li>
              </ul>
            </div>

            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
              <p className="font-bold text-primary">💡 Tip</p>
              <p className="text-on-surface-variant mt-1">The bot uses AI (Gemini) to reply to non-command messages. Configure your AI settings in the main settings page.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

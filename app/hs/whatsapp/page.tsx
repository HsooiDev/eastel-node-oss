"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface BotConfig {
  whatsapp_bot_enabled?: string;
  whatsapp_bot_active_hours_start?: string;
  whatsapp_bot_active_hours_end?: string;
  whatsapp_bot_model?: string;
  whatsapp_bot_system_prompt?: string;
}

interface Conversation {
  phone: string;
  contact_name: string | null;
  first_seen: string;
  last_seen: string;
  last_message: string;
  last_direction: string;
  message_count: number;
}

interface ChatMessage {
  id: number;
  phone: string;
  direction: "in" | "out";
  message: string;
  msg_id: string | null;
  msg_type: string | null;       // text/image/audio/video/document/sticker/deleted
  media_data: string | null;     // JSON { type, url } from Node.js uploads
  media_path: string | null;     // local file path from PHP/webhook downloads
  reply_to_msg_id: string | null;
  reply_ms: number | null;
  edited: number | null;
  reactions: { emoji: string; count: number }[];
  created_at: string;
}

interface Tag {
  id: number;
  name: string;
  color: string;
}

interface Template {
  id: number;
  template_name: string;
  shortcut: string | null;
  content: string;
  category: string | null;
}

interface EscalationRule {
  id: number;
  rule_name: string;
  condition_type: string;
  threshold: number;
  is_active: number;
  action_pause_bot: number;
  action_add_tag: number;
  action_notify_admin: number;
}

interface Stats {
  totalMessages: number;
  todayMessages: number;
  uniqueCustomers: number;
  pendingQueue: number;
}

type Tab = "dashboard" | "templates" | "escalation" | "test";

export default function WhatsAppAdminPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [config, setConfig] = useState<BotConfig>({});
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  // Chat viewer state
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatTags, setChatTags] = useState<Tag[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const lastMsgIdRef = useRef<number>(0);
  const isAtBottomRef = useRef(true);

  // Edit / Reply / React state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: number; message: string } | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [reactions, setReactions] = useState<Record<number, { emoji: string; count: number }[]>>({});
  const [notes, setNotes] = useState<{ id: number; note: string; admin_id: string; created_at: string }[]>([]);
  const [noteInput, setNoteInput] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [aiReplying, setAiReplying] = useState(false);
  const [voiceMode, setVoiceMode] = useState<"text" | "voice">("text");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; msg: ChatMessage } | null>(null);
  const [translations, setTranslations] = useState<Record<number, { en?: string; zh?: string; loadingLang?: "en" | "zh" }>>({});
  const [showingTrans, setShowingTrans] = useState<Record<number, "en" | "zh" | null>>({});

  // Templates state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateForm, setTemplateForm] = useState({ id: 0, template_name: "", shortcut: "", content: "", category: "" });

  // Escalation state
  const [rules, setRules] = useState<EscalationRule[]>([]);
  const [ruleForm, setRuleForm] = useState({ id: 0, rule_name: "", condition_type: "consecutive_short", threshold: 3, is_active: true, action_pause_bot: true, action_add_tag: false, action_notify_admin: true });

  // Test bot state
  const [testMessage, setTestMessage] = useState("");
  const [testReply, setTestReply] = useState("");
  const [testing, setTesting] = useState(false);

  const isEnabled = config.whatsapp_bot_enabled === "true";

  // ── Fetch data based on tab ────────────────────────────────

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, convRes, statsRes] = await Promise.all([
        fetch("/api/admin/whatsapp"),
        fetch("/api/admin/whatsapp?action=conversations&per_page=20"),
        fetch("/api/admin/whatsapp?action=stats"),
      ]);
      const c = await configRes.json();
      const cv = await convRes.json();
      const s = await statsRes.json();
      if (c.config) setConfig(c.config);
      if (cv.conversations) setConversations(cv.conversations);
      if (s.stats) setStats(s.stats);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  const fetchChat = useCallback(async (phone: string) => {
    try {
      const res = await fetch(`/api/admin/whatsapp?action=chat&phone=${encodeURIComponent(phone)}`);
      const data = await res.json();
      if (data.messages) {
        const msgs = data.messages as ChatMessage[];
        setChatMessages(msgs);
        const initReactions: Record<number, { emoji: string; count: number }[]> = {};
        for (const m of msgs) {
          if (m.reactions && m.reactions.length > 0) initReactions[m.id] = m.reactions;
        }
        setReactions(initReactions);
        if (msgs.length > 0) lastMsgIdRef.current = msgs[msgs.length - 1].id;
      }
      if (data.tags) setChatTags(data.tags);
    } catch { /* silent */ }
  }, []);

  async function pollChat(phone: string) {
    try {
      const since = lastMsgIdRef.current;
      const res = await fetch(`/api/admin/whatsapp?action=chat&phone=${encodeURIComponent(phone)}&since=${since}`);
      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        const newMsgs = data.messages as ChatMessage[];
        // Check if scroll is at bottom before updating
        const container = chatContainerRef.current;
        isAtBottomRef.current = container
          ? container.scrollHeight - container.scrollTop - container.clientHeight < 60
          : true;
        setChatMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const unique = newMsgs.filter((m) => !existingIds.has(m.id));
          return [...prev, ...unique];
        });
        const latestId = data.messages[data.messages.length - 1].id;
        if (latestId > lastMsgIdRef.current) {
          lastMsgIdRef.current = latestId;
          // If scrolled up, show new message count
          if (!isAtBottomRef.current) {
            setNewMsgCount((c) => c + newMsgs.length);
          }
        }
      }
    } catch { /* silent */ }
  }

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/whatsapp?action=templates");
      const data = await res.json();
      if (data.templates) setTemplates(data.templates);
    } catch { /* silent */ }
  }, []);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/whatsapp?action=escalation");
      const data = await res.json();
      if (data.rules) setRules(data.rules);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (tab === "dashboard") fetchDashboard();
    else if (tab === "templates") fetchTemplates();
    else if (tab === "escalation") fetchRules();
  }, [tab, fetchDashboard, fetchTemplates, fetchRules]);

  useEffect(() => {
    if (selectedPhone) {
      fetchChat(selectedPhone);
      fetchNotes(selectedPhone);
      lastMsgIdRef.current = 0;
      setNewMsgCount(0);
      setShowNotes(false);
    }
  }, [selectedPhone, fetchChat]);

  // Auto-refresh polling when chat is open
  useEffect(() => {
    if (!selectedPhone) return;
    const POLL_MS = 30000;
    const interval = setInterval(() => {
      if (document.visibilityState !== "hidden") {
        pollChat(selectedPhone);
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [selectedPhone]);

  // Auto-scroll when new messages arrive while at bottom
  useEffect(() => {
    if (isAtBottomRef.current && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  // ── Actions ────────────────────────────────────────────────

  async function toggleBot() {
    setToggling(true);
    try {
      const res = await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle" }),
      });
      const data = await res.json();
      if (data.enabled !== undefined) {
        setConfig((p) => ({ ...p, whatsapp_bot_enabled: String(data.enabled) }));
      }
    } catch { /* silent */ }
    setToggling(false);
  }

  async function sendMessage() {
    if (!newMessage.trim() || !selectedPhone) return;
    setSendingMsg(true);
    try {
      const body: Record<string, unknown> = { action: "send", phone: selectedPhone, message: newMessage.trim() };
      if (replyTo) {
        body.reply_to_msg_id = String(replyTo.id);
        body.reply_log_id = replyTo.id;
      }
      await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setNewMessage("");
      setReplyTo(null);
      fetchChat(selectedPhone);
    } catch { /* silent */ }
    setSendingMsg(false);
  }

  async function startEdit(msg: ChatMessage) {
    setEditingId(msg.id);
    setEditText(msg.message);
  }

  async function saveEdit() {
    if (editingId === null || !editText.trim()) return;
    try {
      await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "editMessage", id: editingId, message: editText.trim() }),
      });
      setEditingId(null);
      setEditText("");
      if (selectedPhone) fetchChat(selectedPhone);
    } catch { /* silent */ }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  async function deleteMsg(id: number) {
    if (!confirm("Delete this message?")) return;
    try {
      await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteMessage", id }),
      });
      if (selectedPhone) fetchChat(selectedPhone);
    } catch { /* silent */ }
  }

  function startReply(msg: ChatMessage) {
    setReplyTo({ id: msg.id, message: msg.message.length > 80 ? msg.message.slice(0, 80) + "…" : msg.message });
  }

  function cancelReply() {
    setReplyTo(null);
  }

  async function reactToMsg(msg: ChatMessage, emoji: string) {
    try {
      const res = await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reactMessage", log_id: msg.id, phone: selectedPhone, msg_id: msg.msg_id || String(msg.id), emoji }),
      });
      const data = await res.json();
      if (data.reactions) {
        setReactions((prev) => ({ ...prev, [msg.id]: data.reactions }));
      }
    } catch { /* silent */ }
  }

  async function handleToggleTranslate(msg: ChatMessage, lang: "en" | "zh") {
    const isShowing = showingTrans[msg.id] === lang;
    if (isShowing) {
      setShowingTrans((prev) => ({ ...prev, [msg.id]: null }));
      return;
    }

    if (translations[msg.id]?.[lang]) {
      setShowingTrans((prev) => ({ ...prev, [msg.id]: lang }));
      return;
    }

    setTranslations((prev) => ({
      ...prev,
      [msg.id]: { ...prev[msg.id], loadingLang: lang },
    }));

    try {
      const res = await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "translate_text", text: msg.message }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setTranslations((prev) => ({
          ...prev,
          [msg.id]: {
            ...prev[msg.id],
            en: data.en,
            zh: data.zh,
            loadingLang: undefined,
          },
        }));
        setShowingTrans((prev) => ({ ...prev, [msg.id]: lang }));
      } else {
        alert("Translation failed: " + (data.message || "unknown error"));
        setTranslations((prev) => ({
          ...prev,
          [msg.id]: { ...prev[msg.id], loadingLang: undefined },
        }));
      }
    } catch (err: any) {
      alert("Network error: " + err.message);
      setTranslations((prev) => ({
        ...prev,
        [msg.id]: { ...prev[msg.id], loadingLang: undefined },
      }));
    }
  }

  async function fetchNotes(phone: string) {
    try {
      const res = await fetch(`/api/admin/whatsapp?action=notes&phone=${encodeURIComponent(phone)}`);
      const data = await res.json();
      if (data.notes) setNotes(data.notes);
    } catch { /* silent */ }
  }

  async function addNote() {
    if (!noteInput.trim() || !selectedPhone) return;
    try {
      await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addNote", phone: selectedPhone, note: noteInput.trim() }),
      });
      setNoteInput("");
      fetchNotes(selectedPhone);
    } catch { /* silent */ }
  }

  async function deleteNote(id: number) {
    try {
      await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteNote", id }),
      });
      if (selectedPhone) fetchNotes(selectedPhone);
    } catch { /* silent */ }
  }

  async function aiReply() {
    if (!selectedPhone) return;
    setAiReplying(true);
    try {
      // Build history from last 10 messages
      const history = chatMessages.slice(-10).map((m) => ({
        role: m.direction === "out" ? "assistant" : "user",
        content: m.message,
      }));
      const lastInMsg = [...chatMessages].reverse().find((m) => m.direction === "in");
      const prompt = lastInMsg?.message || "Hello";
      const res = await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", message: prompt, history, session_id: selectedPhone }),
      });
      const data = await res.json();
      if (data.reply) {
        setNewMessage(data.reply);
      }
    } catch { /* silent */ }
    setAiReplying(false);
  }

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener("click", close, { once: true });
    return () => document.removeEventListener("click", close);
  }, [ctxMenu]);

  function openCtxMenu(e: React.MouseEvent, msg: ChatMessage) {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, msg });
  }

  // ── Helpers ────────────────────────────────────────────────

  function renderMedia(msg: ChatMessage): React.ReactNode {
    let type = msg.msg_type;
    if (!type || type === "text") {
      if (msg.media_data) {
        try {
          const parsed = JSON.parse(msg.media_data) as { type: string; url?: string };
          type = parsed.type;
        } catch { /* invalid JSON */ }
      }
    }
    if (!type || type === "text" || type === "deleted") return null;

    const icons: Record<string, string> = { image: "📷", audio: "🎙️", video: "🎬", document: "📄", sticker: "🎨" };
    const labels: Record<string, string> = { image: "Image", audio: "Voice message", video: "Video", document: "Document", sticker: "Sticker" };

    if (type === "image" && msg.media_path) {
      return (
        <div className="mb-1">
          <img
            src={`/api/media?path=${encodeURIComponent(msg.media_path)}`}
            alt="Image"
            className="max-w-[220px] max-h-[240px] rounded-lg object-cover cursor-pointer"
            loading="lazy"
            onClick={() => window.open(`/api/media?path=${encodeURIComponent(msg.media_path!)}`, "_blank")}
          />
        </div>
      );
    }
    if (type === "audio" && msg.media_path) {
      return (
        <div className="mb-1">
          <audio controls preload="none" className="w-[240px] h-[36px]">
            <source src={`/api/media?path=${encodeURIComponent(msg.media_path)}`} />
          </audio>
        </div>
      );
    }
    if (type === "video" && msg.media_path) {
      return (
        <div className="mb-1">
          <video controls preload="none" className="max-w-[260px] max-h-[200px] rounded-lg">
            <source src={`/api/media?path=${encodeURIComponent(msg.media_path)}`} />
          </video>
        </div>
      );
    }
    if (type === "document") {
      const filename = (msg.message || "").replace(/^\[Document: /, "").replace(/\].*$/, "") || "Document";
      if (msg.media_path) {
        return (
          <div className="mb-1">
            <a
              href={`/api/media?path=${encodeURIComponent(msg.media_path)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-high px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container-alt"
            >
              📄 {filename}
            </a>
          </div>
        );
      }
    }
    return (
      <div className="mb-1 flex items-center gap-1.5 text-xs text-on-surface-variant italic">
        <span>{icons[type] ?? "📎"}</span>
        <span>{labels[type] ?? type}</span>
      </div>
    );
  }

  function replyTimeBadge(replyMs: number | null): React.ReactNode {
    if (!replyMs || replyMs <= 0) return null;
    const sec = (replyMs / 1000).toFixed(1);
    const cls =
      replyMs > 10000
        ? "bg-red-500/10 text-red-500"
        : replyMs > 3000
        ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
        : "bg-green-500/10 text-green-600 dark:text-green-400";
    return (
      <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cls} ml-1`}>
        {sec}s
      </span>
    );
  }

  function insertTemplate(content: string) {
    // Replace {{name}}, {{phone}}, {{plan}} placeholders
    const filled = content
      .replace(/\{\{name\}\}/g, selectedPhone || "")
      .replace(/\{\{phone\}\}/g, selectedPhone || "")
      .replace(/\{\{plan\}\}/g, "Eastel Prepaid");
    setNewMessage(filled);
    setShowTemplates(false);
  }

  async function clearChat() {
    if (!selectedPhone) return;
    if (!confirm(`Delete ALL messages, tags, and notes for ${selectedPhone}? This cannot be undone.`)) return;
    try {
      await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clearChat", phone: selectedPhone }),
      });
      setChatMessages([]);
      setChatTags([]);
      setNotes([]);
    } catch { /* silent */ }
  }

  async function addChatTag(tagName: string) {
    if (!selectedPhone) return;
    const color = ["#9B7BFF", "#FF6B6B", "#4ECDC4", "#FFD93D", "#6BCB77", "#4D96FF", "#FF8C42", "#C9B1FF", "#FF6B8A", "#45B7D1"][Math.floor(Math.random() * 10)];
    try {
      await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addTag", phone: selectedPhone, tag_name: tagName, tag_color: color }),
      });
      fetchChat(selectedPhone);
    } catch { /* silent */ }
  }

  async function removeChatTag(id: number) {
    if (!selectedPhone) return;
    try {
      await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "removeTag", id }),
      });
      fetchChat(selectedPhone);
    } catch { /* silent */ }
  }

  function handleMessageChange(value: string) {
    setNewMessage(value);
    // Show template picker on / shortcut
    if (value.endsWith("/") && !showTemplates) {
      setShowTemplates(true);
      fetchTemplates();
    }
    if (showTemplates && !value.includes("/")) {
      setShowTemplates(false);
    }
  }

  async function saveTemplate() {
    if (!templateForm.template_name || !templateForm.content) return;
    try {
      await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveTemplate", ...templateForm }),
      });
      setTemplateForm({ id: 0, template_name: "", shortcut: "", content: "", category: "" });
      fetchTemplates();
    } catch { /* silent */ }
  }

  async function deleteTemplate(id: number) {
    try {
      await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteTemplate", id }),
      });
      fetchTemplates();
    } catch { /* silent */ }
  }

  async function saveRule() {
    if (!ruleForm.rule_name) return;
    try {
      await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveEscalation", ...ruleForm }),
      });
      setRuleForm({ id: 0, rule_name: "", condition_type: "consecutive_short", threshold: 3, is_active: true, action_pause_bot: true, action_add_tag: false, action_notify_admin: true });
      fetchRules();
    } catch { /* silent */ }
  }

  async function deleteRule(id: number) {
    try {
      await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteEscalation", id }),
      });
      fetchRules();
    } catch { /* silent */ }
  }

  async function testBot() {
    if (!testMessage.trim()) return;
    setTesting(true);
    try {
      const res = await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", message: testMessage.trim(), system_prompt: config.whatsapp_bot_system_prompt || "" }),
      });
      const data = await res.json();
      setTestReply(data.reply || data.message || "No response");
    } catch { /* silent */ }
    setTesting(false);
  }

  async function exportCSV() {
    try {
      const res = await fetch("/api/admin/whatsapp?action=export");
      const data = await res.json();
      if (data.csv) {
        const blob = new Blob([data.csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "whatsapp-export.csv"; a.click();
        URL.revokeObjectURL(url);
      }
    } catch { /* silent */ }
  }

  async function selfEnhance() {
    const q = prompt("Question:");
    const a = prompt("Answer:");
    if (!q || !a) return;
    try {
      await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "selfEnhance", question: q, answer: a }),
      });
      alert("Saved to knowledge base.");
    } catch { /* silent */ }
  }

  // ── Render ─────────────────────────────────────────────────

  const tabs: { key: Tab; label: string }[] = [
    { key: "dashboard", label: "Dashboard" },
    { key: "templates", label: "Templates" },
    { key: "escalation", label: "Escalation" },
    { key: "test", label: "Test Bot" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-on-surface">WhatsApp Bot</h1>
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={selfEnhance}>+ Learn</Button>
          <Button variant="secondary" size="sm" onClick={exportCSV}>Export CSV</Button>
          <Button variant={isEnabled ? "danger" : "primary"} onClick={toggleBot} loading={toggling}>
            {isEnabled ? "Disable" : "Enable"}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-outline-variant pb-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t.key ? "bg-surface-container text-on-surface border border-outline-variant border-b-transparent -mb-px" : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Dashboard Tab ──────────────────────────────────── */}
      {tab === "dashboard" && (
        <div className="space-y-6">
          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card><CardContent className="pt-6"><p className="text-2xl font-bold">{stats.totalMessages}</p><p className="text-xs text-on-surface-variant">Total Messages</p></CardContent></Card>
              <Card><CardContent className="pt-6"><p className="text-2xl font-bold">{stats.todayMessages}</p><p className="text-xs text-on-surface-variant">Today</p></CardContent></Card>
              <Card><CardContent className="pt-6"><p className="text-2xl font-bold">{stats.uniqueCustomers}</p><p className="text-xs text-on-surface-variant">Customers</p></CardContent></Card>
              <Card><CardContent className="pt-6"><p className="text-2xl font-bold">{stats.pendingQueue}</p><p className="text-xs text-on-surface-variant">Pending</p></CardContent></Card>
            </div>
          )}

          {/* Config */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card><CardHeader><CardTitle className="text-sm text-on-surface-variant">Status</CardTitle></CardHeader><CardContent><Badge variant={isEnabled ? "success" : "error"}>{isEnabled ? "Online" : "Offline"}</Badge></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm text-on-surface-variant">Hours</CardTitle></CardHeader><CardContent><p className="font-mono text-sm">{config.whatsapp_bot_active_hours_start || "00:00"} – {config.whatsapp_bot_active_hours_end || "23:59"}</p></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm text-on-surface-variant">Model</CardTitle></CardHeader><CardContent><p className="font-mono text-sm">{config.whatsapp_bot_model || "gemini-2.0-flash"}</p></CardContent></Card>
          </div>

          {/* Conversations + Chat Viewer */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card padding="none">
              <CardHeader className="px-6 pt-6"><CardTitle>Conversations</CardTitle></CardHeader>
              <CardContent className="px-6 pb-6">
                {conversations.length === 0 ? (
                  <p className="text-on-surface-variant text-sm py-4 text-center">No conversations.</p>
                ) : (
                  <div className="space-y-1 max-h-96 overflow-y-auto">
                    {conversations.map((c) => (
                      <button
                        key={c.phone}
                        onClick={() => setSelectedPhone(c.phone)}
                        className={`w-full text-left p-3 rounded-lg text-sm transition-colors ${
                          selectedPhone === c.phone ? "bg-primary/10 border border-primary/30" : "hover:bg-surface-container-high border border-transparent"
                        }`}
                      >
                        <div className="flex justify-between">
                          <span className="font-medium">{c.contact_name || c.phone}</span>
                          <Badge variant="info">{c.message_count}</Badge>
                        </div>
                        <p className="text-xs text-on-surface-variant truncate mt-1">{c.last_message}</p>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Chat viewer */}
            <Card padding="none">
              <CardHeader className="px-6 pt-6 flex flex-row items-center justify-between">
                <CardTitle>{selectedPhone ? `Chat: ${selectedPhone}` : "Select a conversation"}</CardTitle>
                {selectedPhone && (
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={() => setVoiceMode((v) => v === "text" ? "voice" : "text")}
                      className={`text-sm px-2 py-1 rounded-lg border transition-colors ${voiceMode === "voice" ? "border-primary/50 bg-primary/10 text-primary" : "border-outline-variant text-on-surface-variant hover:text-on-surface"}`}
                      title={voiceMode === "voice" ? "Voice reply ON — click for text" : "Text reply — click for voice"}
                    >
                      {voiceMode === "voice" ? "🎤" : "💬"}
                    </button>
                    <Button size="sm" variant="secondary" onClick={aiReply} loading={aiReplying} title="Generate AI reply from last customer message">🤖 AI</Button>
                    <Button size="sm" variant="secondary" onClick={clearChat} title="Clear entire chat history">🗑️ Clear</Button>
                    <button onClick={() => setSelectedPhone(null)} className="text-on-surface-variant hover:text-red-500 text-sm px-2" title="Close chat">✕</button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="px-6 pb-6">
                {!selectedPhone ? (
                  <p className="text-on-surface-variant text-sm py-8 text-center">Click a conversation to view.</p>
                ) : (
                  <div className="space-y-3">
                    {/* Tags */}
                    <div className="flex gap-1 flex-wrap items-center">
                      {chatTags.map((t) => (
                        <span key={t.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: t.color + "20", color: t.color, border: `1px solid ${t.color}40` }}>
                          {t.name}
                          <button onClick={() => removeChatTag(t.id)} className="hover:text-red-500">✕</button>
                        </span>
                      ))}
                      <input
                        type="text"
                        placeholder="+ tag"
                        className="w-16 rounded-full border border-dashed border-outline-variant bg-transparent px-2 py-0.5 text-xs text-on-surface-variant focus:border-primary focus:outline-none"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && e.currentTarget.value.trim()) {
                            addChatTag(e.currentTarget.value.trim());
                            e.currentTarget.value = "";
                          }
                        }}
                      />
                    </div>
                    {/* Notes toggle */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowNotes(!showNotes)}
                        className={`text-xs font-medium px-2 py-1 rounded transition-colors ${showNotes ? "bg-primary/10 text-primary" : "text-on-surface-variant hover:text-on-surface"}`}
                      >
                        📝 Notes {notes.length > 0 && `(${notes.length})`}
                      </button>
                    </div>
                    {/* Notes panel */}
                    {showNotes && (
                      <div className="border border-outline-variant rounded-lg p-3 space-y-2 bg-surface-container-alt/50">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={noteInput}
                            onChange={(e) => setNoteInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") addNote(); }}
                            placeholder="Add a private note..."
                            className="flex-1 rounded-lg border border-outline-variant bg-surface-container px-2 py-1 text-xs text-on-surface focus:border-primary focus:outline-none"
                          />
                          <button onClick={addNote} className="text-xs text-primary hover:underline shrink-0">Add</button>
                        </div>
                        {notes.length === 0 ? (
                          <p className="text-xs text-on-surface-variant text-center py-2">No notes yet.</p>
                        ) : (
                          <div className="space-y-1.5 max-h-32 overflow-y-auto">
                            {notes.map((n) => (
                              <div key={n.id} className="flex items-start justify-between gap-2 text-xs">
                                <div>
                                  <span className="text-on-surface">{n.note}</span>
                                  <span className="text-on-surface-variant ml-2">— {n.admin_id}</span>
                                </div>
                                <button onClick={() => deleteNote(n.id)} className="text-on-surface-variant hover:text-red-500 shrink-0">✕</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Reply bar */}
                    {replyTo && (
                      <div className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-alt px-3 py-2 text-sm">
                        <span className="text-on-surface-variant shrink-0">↩ Replying:</span>
                        <span className="flex-1 text-on-surface truncate">{replyTo.message}</span>
                        <button onClick={cancelReply} className="text-on-surface-variant hover:text-red-500 shrink-0">✕</button>
                      </div>
                    )}
                    {/* Messages */}
                    <div className="relative">
                      <div
                        ref={chatContainerRef}
                        className="max-h-96 overflow-y-auto space-y-2 border border-outline-variant rounded-lg p-3"
                        onScroll={() => {
                          if (chatContainerRef.current) {
                            const el = chatContainerRef.current;
                            isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
                            if (isAtBottomRef.current) setNewMsgCount(0);
                          }
                        }}
                      >
                        {chatMessages.map((m) => {
                          const isDeleted = m.msg_type === "deleted";
                          const isEdited = m.edited === 1;
                          return (
                          <div
                            key={m.id}
                            className={`text-sm group ${m.direction === "in" ? "text-left" : "text-right"}`}
                            onMouseEnter={() => setHoveredId(m.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            onContextMenu={(e) => !isDeleted && openCtxMenu(e, m)}
                          >
                            {/* Reply quote */}
                            {m.reply_to_msg_id && (() => {
                              const orig = chatMessages.find((x) => x.msg_id === m.reply_to_msg_id);
                              return (
                                <span className="inline-block text-[10px] text-on-surface-variant italic mb-0.5 px-2 py-0.5 rounded bg-surface-container-high/50 border-l-2 border-primary/40">
                                  ↪ {orig ? (orig.direction === "out" ? "Eastel" : orig.phone) + ": " + (orig.message || "").slice(0, 50) : "Replying to a message"}
                                </span>
                              );
                            })()}
                            {/* Message bubble or edit mode */}
                            {editingId === m.id ? (
                              <div className="flex gap-1">
                                <input
                                  type="text"
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                                  className="flex-1 rounded-lg border border-primary bg-surface-container px-2 py-1 text-sm text-on-surface focus:outline-none"
                                  autoFocus
                                />
                                <button onClick={saveEdit} className="text-xs text-primary hover:underline shrink-0 px-1">Save</button>
                                <button onClick={cancelEdit} className="text-xs text-on-surface-variant hover:underline shrink-0 px-1">Cancel</button>
                              </div>
                            ) : (
                              <>
                                <span className={`inline-block px-3 py-1.5 rounded-lg max-w-[80%] break-words whitespace-pre-wrap text-left ${
                                  isDeleted
                                    ? "bg-surface-container-alt text-on-surface-variant italic border border-outline-variant"
                                    : m.direction === "in"
                                    ? "bg-surface-container-high text-on-surface"
                                    : "bg-primary/20 text-on-surface"
                                }`}>
                                  {renderMedia(m)}
                                  {isDeleted ? "🚫 Message deleted" : m.message}
                                  {isEdited && !isDeleted && (
                                    <span className="text-[10px] text-on-surface-variant italic ml-1">(edited)</span>
                                  )}

                                  {/* Translation Bar */}
                                  {(() => {
                                    const isTextOrCaption = !m.msg_type || m.msg_type === "text" || (m.msg_type === "image" && m.message && m.message !== "[Customer sent an image]");
                                    const showTranslate = m.direction === "in" && !isDeleted && isTextOrCaption && m.message;
                                    if (!showTranslate) return null;
                                    return (
                                      <>
                                        <div className="mt-1.5 pt-1 border-t border-dashed border-outline-variant text-[10px] flex gap-2 items-center">
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleToggleTranslate(m, "en"); }}
                                            className="px-2 py-0.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary transition-colors text-[10px] font-medium"
                                            disabled={translations[m.id]?.loadingLang !== undefined}
                                          >
                                            {translations[m.id]?.loadingLang === "en" ? "⏳ Translating…" : showingTrans[m.id] === "en" ? "✕ Hide EN" : "🌐 Translate to EN"}
                                          </button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleToggleTranslate(m, "zh"); }}
                                            className="px-2 py-0.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary transition-colors text-[10px] font-medium"
                                            disabled={translations[m.id]?.loadingLang !== undefined}
                                          >
                                            {translations[m.id]?.loadingLang === "zh" ? "⏳ Translating…" : showingTrans[m.id] === "zh" ? "✕ Hide ZH" : "🌐 Translate to ZH"}
                                          </button>
                                        </div>
                                        {showingTrans[m.id] && translations[m.id]?.[showingTrans[m.id]!] && (
                                          <div className="mt-1.5 p-2 rounded bg-surface-container border-l-2 border-primary text-xs text-on-surface-variant font-mono">
                                            <strong>{showingTrans[m.id]!.toUpperCase()}:</strong> {translations[m.id]![showingTrans[m.id]!]}
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()}
                                </span>
                                <p className="text-[10px] text-on-surface-variant mt-0.5">
                                  {new Date(m.created_at).toLocaleString("en-MY")}
                                  {m.direction === "out" && replyTimeBadge(m.reply_ms)}
                                </p>
                              </>
                            )}
                            {/* Hover actions */}
                            {hoveredId === m.id && editingId !== m.id && !isDeleted && (
                              <div className={`flex gap-0.5 mt-0.5 ${m.direction === "in" ? "justify-start" : "justify-end"}`}>
                                {/* Reply */}
                                <button onClick={() => startReply(m)} className="text-on-surface-variant hover:text-primary p-0.5" title="Reply">
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                                </button>
                                {/* Edit (outgoing only) */}
                                {m.direction === "out" && (
                                  <button onClick={() => startEdit(m)} className="text-on-surface-variant hover:text-primary p-0.5" title="Edit">
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                  </button>
                                )}
                                {/* Delete */}
                                <button onClick={() => deleteMsg(m.id)} className="text-on-surface-variant hover:text-red-500 p-0.5" title="Delete">
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                </button>
                                {/* Emoji quick reacts */}
                                {["👍","❤️","😂","😮","😢","🙏","🔥","🎉"].map((emoji) => (
                                  <button key={emoji} onClick={() => reactToMsg(m, emoji)} className="text-on-surface-variant hover:scale-125 transition-transform p-0.5 text-xs" title={emoji}>{emoji}</button>
                                ))}
                              </div>
                            )}
                            {/* Reaction chips */}
                            {reactions[m.id] && reactions[m.id].length > 0 && (
                              <div className={`flex gap-1 mt-0.5 ${m.direction === "in" ? "justify-start" : "justify-end"}`}>
                                {reactions[m.id].map((r) => (
                                  <span key={r.emoji} className="inline-flex items-center gap-0.5 rounded-full bg-surface-container-alt px-1.5 py-0.5 text-[11px] border border-outline-variant">
                                    {r.emoji} <span className="text-on-surface-variant">{r.count}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          );
                        })}
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
                    {/* Template picker */}
                    {showTemplates && templates.length > 0 && (
                      <div className="border border-outline-variant rounded-lg p-2 space-y-1 max-h-40 overflow-y-auto bg-surface-container">
                        {templates.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => insertTemplate(t.content)}
                            className="w-full text-left px-2 py-1 rounded text-xs hover:bg-surface-container-high transition-colors"
                          >
                            <span className="font-medium text-on-surface">{t.template_name}</span>
                            {t.shortcut && <code className="text-on-surface-variant ml-1">/{t.shortcut}</code>}
                            <span className="block text-on-surface-variant truncate">{t.content.slice(0, 60)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Send */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => handleMessageChange(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                        placeholder={replyTo ? "Type a reply..." : "Type a message... (use / for templates)"}
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

      {/* ── Templates Tab ──────────────────────────────────── */}
      {tab === "templates" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>{templateForm.id ? "Edit" : "New"} Template</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input label="Name" value={templateForm.template_name} onChange={(e) => setTemplateForm({ ...templateForm, template_name: e.target.value })} />
              <Input label="Shortcut" value={templateForm.shortcut} onChange={(e) => setTemplateForm({ ...templateForm, shortcut: e.target.value })} />
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1">Content</label>
                <textarea value={templateForm.content} onChange={(e) => setTemplateForm({ ...templateForm, content: e.target.value })} rows={4} className="w-full rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none resize-none" />
              </div>
              <Input label="Category" value={templateForm.category} onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })} />
              <Button fullWidth onClick={saveTemplate}>Save Template</Button>
            </CardContent>
          </Card>
          <Card padding="none">
            <CardHeader className="px-6 pt-6"><CardTitle>Templates ({templates.length})</CardTitle></CardHeader>
            <CardContent className="px-6 pb-6">
              {templates.length === 0 ? (
                <p className="text-on-surface-variant text-sm text-center py-4">No templates.</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {templates.map((t) => (
                    <div key={t.id} className="p-3 rounded-lg border border-outline-variant">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-sm">{t.template_name} {t.shortcut && <code className="text-xs bg-surface-container-high px-1 py-0.5 rounded">{t.shortcut}</code>}</p>
                          <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">{t.content}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="secondary" size="sm" onClick={() => setTemplateForm({ id: t.id, template_name: t.template_name, shortcut: t.shortcut || "", content: t.content, category: t.category || "" })}>Edit</Button>
                          <Button variant="danger" size="sm" onClick={() => deleteTemplate(t.id)}>Del</Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Escalation Tab ─────────────────────────────────── */}
      {tab === "escalation" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>{ruleForm.id ? "Edit" : "New"} Rule</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input label="Rule Name" value={ruleForm.rule_name} onChange={(e) => setRuleForm({ ...ruleForm, rule_name: e.target.value })} />
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1">Condition</label>
                <select value={ruleForm.condition_type} onChange={(e) => setRuleForm({ ...ruleForm, condition_type: e.target.value })} className="w-full rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface">
                  <option value="consecutive_short">Consecutive Short Messages</option>
                </select>
              </div>
              <Input label="Threshold" type="number" value={String(ruleForm.threshold)} onChange={(e) => setRuleForm({ ...ruleForm, threshold: Number(e.target.value) || 3 })} />
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ruleForm.is_active} onChange={(e) => setRuleForm({ ...ruleForm, is_active: e.target.checked })} /> Active</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ruleForm.action_pause_bot} onChange={(e) => setRuleForm({ ...ruleForm, action_pause_bot: e.target.checked })} /> Pause Bot</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ruleForm.action_add_tag} onChange={(e) => setRuleForm({ ...ruleForm, action_add_tag: e.target.checked })} /> Add Tag</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ruleForm.action_notify_admin} onChange={(e) => setRuleForm({ ...ruleForm, action_notify_admin: e.target.checked })} /> Notify Admin</label>
              </div>
              <Button fullWidth onClick={saveRule}>Save Rule</Button>
            </CardContent>
          </Card>
          <Card padding="none">
            <CardHeader className="px-6 pt-6"><CardTitle>Rules ({rules.length})</CardTitle></CardHeader>
            <CardContent className="px-6 pb-6">
              {rules.length === 0 ? (
                <p className="text-on-surface-variant text-sm text-center py-4">No rules.</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {rules.map((r) => (
                    <div key={r.id} className="p-3 rounded-lg border border-outline-variant">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-sm">{r.rule_name} <Badge variant={r.is_active ? "success" : "error"}>{r.is_active ? "Active" : "Inactive"}</Badge></p>
                          <p className="text-xs text-on-surface-variant">{r.condition_type} ≥ {r.threshold}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="secondary" size="sm" onClick={() => setRuleForm({ id: r.id, rule_name: r.rule_name, condition_type: r.condition_type, threshold: r.threshold, is_active: r.is_active === 1, action_pause_bot: r.action_pause_bot === 1, action_add_tag: r.action_add_tag === 1, action_notify_admin: r.action_notify_admin === 1 })}>Edit</Button>
                          <Button variant="danger" size="sm" onClick={() => deleteRule(r.id)}>Del</Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Test Bot Tab ───────────────────────────────────── */}
      {tab === "test" && (
        <Card>
          <CardHeader><CardTitle>Test Bot</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Message</label>
              <textarea
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                rows={3}
                placeholder="Enter a test message..."
                className="w-full rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none resize-none"
              />
            </div>
            <Button onClick={testBot} loading={testing}>Test</Button>
            {testReply && (
              <div className="p-4 rounded-lg bg-surface-container border border-outline-variant">
                <p className="text-xs text-on-surface-variant mb-1">Bot response:</p>
                <p className="text-sm text-on-surface whitespace-pre-wrap">{testReply}</p>
                <button
                  className="mt-2 text-xs text-primary hover:underline"
                  onClick={async () => {
                    if (confirm("Save this Q&A to knowledge base?")) {
                      await fetch("/api/admin/whatsapp", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "selfEnhance", question: testMessage, answer: testReply }),
                      });
                      alert("Saved.");
                    }
                  }}
                >
                  Save to knowledge base
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Context Menu ───────────────────────────────────────── */}
      {ctxMenu && (
        <div
          className="fixed z-50 bg-surface-container border border-outline-variant rounded-xl shadow-2xl py-1 min-w-[160px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { startReply(ctxMenu.msg); setCtxMenu(null); }}
            className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
            Reply
          </button>
          {ctxMenu.msg.direction === "out" && (
            <button
              onClick={() => { startEdit(ctxMenu.msg); setCtxMenu(null); }}
              className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              Edit
            </button>
          )}
          <div className="my-1 border-t border-outline-variant" />
          <button
            onClick={() => { deleteMsg(ctxMenu.msg.id); setCtxMenu(null); }}
            className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

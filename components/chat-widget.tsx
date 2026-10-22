"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { Spinner } from "@/components/ui/spinner";
import { MONTHLY_PLANS } from "@/lib/plans-data";

interface Message {
  id: string;
  role: "user" | "bot";
  content: string;
  timestamp: number;
  /** "planCards" renders the plan card grid under the text (PHP chatbot parity) */
  kind?: "text" | "planCards";
}

interface ChipDef {
  key: string;
  fallback: string;
  action?: "plans";
}

// Quick-reply chips — mirrors PHP js/chatbot.js UI.chips
const CHIP_DEFS: ChipDef[] = [
  { key: "chat.chips.plans", fallback: "Plans & Pricing", action: "plans" },
  { key: "chat.chips.buySim", fallback: "Buy SIM" },
  { key: "chat.chips.trackOrder", fallback: "Track Order" },
  { key: "chat.chips.roaming", fallback: "Roaming" },
  { key: "chat.chips.ep", fallback: "EASTELpreneurs" },
  { key: "chat.chips.contact", fallback: "Contact Us" },
];

const COOLDOWN_MS = 1000;
const MAX_MESSAGE_LENGTH = 2000;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ChatWidget() {
  const { t, locale } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [lastSendTime, setLastSendTime] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isOpenRef = useRef(false);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Escape key to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const sendText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    const now = Date.now();
    if (now - lastSendTime < COOLDOWN_MS) return;
    if (trimmed.length > MAX_MESSAGE_LENGTH) return;

    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: trimmed,
      timestamp: now,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsSending(true);
    setLastSendTime(now);

    try {
      const history = messages.map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        content: msg.content,
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
      });

      const data = (await response.json()) as {
        reply?: string;
        error?: string;
      };

      if (!response.ok) {
        const errorKey =
          data.error === "rate_limit" ? "chat.rateLimit" : "chat.error";
        const botMessage: Message = {
          id: generateId(),
          role: "bot",
          content: t(
            errorKey,
            "Sorry, something went wrong. Please try again."
          ),
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, botMessage]);
        return;
      }

      const botMessage: Message = {
        id: generateId(),
        role: "bot",
        content: data.reply ?? t("chat.error", "Sorry, something went wrong."),
        timestamp: Date.now(),
      };
      setMessages((prev) => {
        if (!isOpenRef.current) setUnreadCount((c) => c + 1);
        return [...prev, botMessage];
      });
    } catch {
      const botMessage: Message = {
        id: generateId(),
        role: "bot",
        content: t(
          "chat.error",
          "Sorry, something went wrong. Please try again."
        ),
        timestamp: Date.now(),
      };
      setMessages((prev) => {
        if (!isOpenRef.current) setUnreadCount((c) => c + 1);
        return [...prev, botMessage];
      });
    } finally {
      setIsSending(false);
    }
  }, [isSending, lastSendTime, messages, t]);

  const sendMessage = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    void sendText(trimmed);
  }, [input, sendText]);

  // Chip click — "plans" renders plan cards locally (PHP parity),
  // everything else is sent to the AI like a typed message.
  function handleChip(label: string, action?: "plans") {
    if (isSending) return;
    if (action === "plans") {
      const now = Date.now();
      const userMessage: Message = {
        id: generateId(),
        role: "user",
        content: label,
        timestamp: now,
      };
      const botMessage: Message = {
        id: generateId(),
        role: "bot",
        content: t(
          "chat.plans.intro",
          "Here are Eastel's available monthly plans 📱 Monthly plans include unlimited calls (FUP 1000 mins)."
        ),
        timestamp: now,
        kind: "planCards",
      };
      setMessages((prev) => [...prev, userMessage, botMessage]);
      return;
    }
    void sendText(label);
  }

  function handleOpen() {
    setIsOpen(true);
    isOpenRef.current = true;
    setUnreadCount(0);
  }

  function handleClose() {
    setIsOpen(false);
    isOpenRef.current = false;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const chatTitle = t("chat.title", "Eastel AI Assistant");
  const placeholder = t("chat.placeholder", "Type your message...");
  const sendLabel = t("chat.send", "Send");
  const typingLabel = t("chat.typing", "Typing...");
  const welcomeMessage = t(
    "chat.welcome",
    "Hi! I'm Eastel's AI assistant. How can I help you today?"
  );

  return (
    <>
      {/* Floating Chat Button */}
      <button
        onClick={() => (isOpen ? handleClose() : handleOpen())}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2"
        style={{
          position: "fixed",
          right: "1.5rem",
          bottom: "1.5rem",
          zIndex: 50,
          width: "3.5rem",
          height: "3.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "9999px",
          backgroundColor: "var(--color-accent, #9b7bff)",
          color: "#fff",
          boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.2)",
        }}
        aria-label={isOpen ? "Close chat" : "Open chat"}
        aria-expanded={isOpen}
      >
        {!isOpen && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white ring-2 ring-surface">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
        {isOpen ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={chatTitle}
          className="fixed bottom-24 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl sm:right-6"
          style={{ maxHeight: "500px" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between bg-brand px-4 py-3">
            <div className="flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"
                />
              </svg>
              <span className="text-sm font-semibold text-white">
                {chatTitle}
              </span>
              <span className="rounded bg-white/20 px-1.5 py-0.5 text-xs text-white">
                {locale.toUpperCase()}
              </span>
            </div>
            <button
              onClick={handleClose}
              className="flex h-7 w-7 items-center justify-center rounded text-white/80 transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              aria-label="Close chat"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto px-4 py-3"
            style={{ minHeight: "280px", maxHeight: "340px" }}
          >
            {messages.length === 0 && (
              <div className="mb-3 flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-surface-alt px-3.5 py-2.5 text-sm text-foreground">
                  {welcomeMessage}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`mb-3 flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                    msg.role === "user"
                      ? "rounded-br-md bg-accent text-white"
                      : "rounded-bl-md bg-surface-alt text-foreground"
                  }`}
                >
                  {msg.content}
                  {msg.kind === "planCards" && (
                    <div className="mt-2 space-y-2">
                      {MONTHLY_PLANS.map((p) => (
                        <div
                          key={p.id}
                          className="rounded-lg border border-border bg-surface p-3"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-bold text-foreground">
                              {p.name}
                            </span>
                            <span className="text-sm font-bold text-brand">
                              {p.price}
                              <span className="text-xs font-medium text-foreground-muted">
                                {t("chat.plans.perMonth", "/mo")}
                              </span>
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-foreground-muted">
                            <span>
                              📶 {p.data} {t("chat.plans.data", "Data")}
                            </span>
                            <span>
                              📡 {t("chat.plans.hotspot", "Hotspot")}:{" "}
                              {p.hotspot === "Full Hotspot"
                                ? t("chat.plans.full", "Full")
                                : p.hotspot.replace(" Hotspot", "")}
                            </span>
                            {p.roaming && (
                              <span>
                                🌏 {t("chat.plans.roaming", "Roaming")}:{" "}
                                {p.roaming}
                              </span>
                            )}
                          </div>
                          <a
                            href={`/${locale}/order`}
                            className="mt-2 inline-block text-xs font-semibold text-brand hover:underline"
                          >
                            {t("chat.plans.buyCta", "Buy SIM Now →")}
                          </a>
                        </div>
                      ))}
                      <a
                        href={`/${locale}/plans`}
                        className="inline-block text-xs font-semibold text-brand hover:underline"
                      >
                        {t("chat.plans.viewAll", "View all plans →")}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isSending && (
              <div className="mb-3 flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-surface-alt px-3.5 py-2.5 text-sm text-foreground-muted">
                  <Spinner size="sm" />
                  <span>{typingLabel}</span>
                </div>
              </div>
            )}

            {/* Quick-reply chips (PHP chatbot parity) */}
            {!isSending &&
              (messages.length === 0 ||
                messages[messages.length - 1].role === "bot") && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {CHIP_DEFS.map((c) => {
                    const label = t(c.key, c.fallback);
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => handleChip(label, c.action)}
                        className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border px-3 py-3">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={isSending}
                maxLength={MAX_MESSAGE_LENGTH}
                className="flex-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary outline-none transition-colors focus:border-brand focus:ring-1 focus:ring-brand/30 disabled:opacity-50"
                aria-label={placeholder}
              />
              <button
                onClick={sendMessage}
                disabled={isSending || !input.trim()}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white transition-all hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={sendLabel}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

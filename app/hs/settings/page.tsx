"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlanRecommenderAdmin } from "@/components/plan-recommender";
import { isPlanRecommenderSettingKey } from "@/lib/plan-recommender-key";

interface SettingEntry {
  key: string;
  value: string;
}

// Known feature toggles — rendered as switches instead of raw text fields.
const FEATURE_TOGGLES: { key: string; label: string; desc: string; warn?: string }[] = [
  {
    key: "abandoned_reminder_enabled",
    label: "Abandoned order reminder (e-mail)",
    desc: "Hourly cron e-mails customers whose order is unpaid for 3–48 hours (once per order). E-mail is free.",
  },
  {
    key: "wa_proactive_enabled",
    label: "Proactive WhatsApp messages",
    desc: "Allows business-initiated WA sends: shipped-order notification + abandoned-order WA reminder.",
    warn: "⚠️ Costs money on the free WhatsApp tier (outside the 24h customer-service window).",
  },
];

const TOGGLE_KEYS = new Set(FEATURE_TOGGLES.map((t) => t.key));

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingEntry[]>([]);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings");
      const data = await res.json();
      if (!res.ok || data.status !== "success" || !data.settings) throw new Error(data.message || "Failed to load settings.");
      if (data.settings) {
        const entries = Object.entries(data.settings as Record<string, string>)
          .filter(([key]) => !isPlanRecommenderSettingKey(key))
          .map(([key, value]) => ({ key, value }));
        setSettings(entries);
        setHasLoadedSettings(true);
      }
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  function getValue(key: string): string {
    return settings.find((s) => s.key === key)?.value ?? "0";
  }

  function setValue(key: string, value: string) {
    setSavedAt(null);
    setSaveError("");
    setSettings((prev) => {
      const exists = prev.some((s) => s.key === key);
      return exists
        ? prev.map((s) => (s.key === key ? { ...s, value } : s))
        : [...prev, { key, value }];
    });
  }

  function updateValue(index: number, value: string) {
    setSavedAt(null);
    setSaveError("");
    setSettings((prev) =>
      prev.map((s, i) => (i === index ? { ...s, value } : s))
    );
  }

  function removeSetting(index: number) {
    setSavedAt(null);
    setSaveError("");
    setSettings((prev) => prev.filter((_, i) => i !== index));
  }

  function addSetting() {
    if (!newKey.trim() || isPlanRecommenderSettingKey(newKey)) return;
    setSavedAt(null);
    setSaveError("");
    setSettings((prev) => [...prev, { key: newKey.trim(), value: newValue }]);
    setNewKey("");
    setNewValue("");
  }

  async function saveSettings() {
    if (!hasLoadedSettings || loading || saving) return;
    setSaving(true);
    setSavedAt(null);
    setSaveError("");
    try {
      const entries: Record<string, string> = {};
      for (const s of settings) {
        if (!isPlanRecommenderSettingKey(s.key)) entries[s.key] = s.value;
      }
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: entries }),
      });
      const data = await res.json();
      if (!res.ok || data.status !== "success") throw new Error(data.message || "Failed to save settings.");
      setSavedAt(Date.now());
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  // Raw list without the toggle keys (they have dedicated switches above)
  const rawSettings = settings
    .map((s, index) => ({ ...s, index }))
    .filter((s) => !TOGGLE_KEYS.has(s.key));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-on-surface">Settings</h1>
        <div className="flex items-center gap-3">
          {savedAt && <span className="text-sm text-green-400">Saved ✓</span>}
          <Button variant="secondary" onClick={() => void fetchSettings()} loading={loading} disabled={saving}>Refresh</Button>
          <Button onClick={saveSettings} loading={saving} disabled={!hasLoadedSettings || loading || saving}>
            Save All
          </Button>
        </div>
      </div>
      {loadError && <p role="alert" className="rounded-lg border border-error/40 bg-error/10 p-3 text-sm text-error">{loadError}{settings.length > 0 ? " Showing the last successfully loaded settings." : ""}</p>}
      {saveError && <p role="alert" className="rounded-lg border border-error/40 bg-error/10 p-3 text-sm text-error">{saveError}</p>}

      <PlanRecommenderAdmin />

      {/* ── Feature Toggles ── */}
      <Card padding="none">
        <CardHeader className="px-6 pt-6">
          <CardTitle>Feature Toggles</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <div className="space-y-4">
            {FEATURE_TOGGLES.map((toggle) => {
              const on = getValue(toggle.key) === "1";
              return (
                <div
                  key={toggle.key}
                  className="flex items-start justify-between gap-4 rounded-lg border border-outline-variant bg-surface-container-alt/30 p-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-on-surface">{toggle.label}</p>
                    <p className="mt-0.5 text-sm text-on-surface-variant">{toggle.desc}</p>
                    {toggle.warn && (
                      <p className="mt-1 text-sm font-medium admin-cost-warning">{toggle.warn}</p>
                    )}
                    <p className="mt-1 font-mono text-xs text-on-surface-variant/60">{toggle.key}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={toggle.label}
                    disabled={!hasLoadedSettings || loading || saving}
                    onClick={() => setValue(toggle.key, on ? "0" : "1")}
                    className="relative h-11 w-11 flex-shrink-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <span aria-hidden="true" className={`absolute top-2.5 left-0 h-6 w-11 rounded-full transition-colors ${on ? "bg-primary" : "bg-outline-variant"}`}><span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                        on ? "left-[22px]" : "left-0.5"
                      }`}
                    /></span>
                  </button>
                </div>
              );
            })}
            <p className="text-xs text-on-surface-variant">
              Remember to press <strong>Save All</strong> after changing toggles.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card padding="none">
        <CardHeader className="px-6 pt-6">
          <CardTitle>Key-Value Settings</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          {loading ? (
            <p className="text-center text-on-surface-variant">Loading...</p>
          ) : (
            <div className="space-y-3">
              {rawSettings.map((setting) => (
                <div
                  key={`${setting.key}-${setting.index}`}
                  className="admin-setting-row rounded-lg border border-outline-variant bg-surface-container-alt/30 p-3"
                >
                  <span className="font-mono text-sm text-on-surface-variant">
                    {setting.key}
                  </span>
                  <input
                    type="text"
                    value={setting.value}
                    onChange={(e) => updateValue(setting.index, e.target.value)}
                    disabled={!hasLoadedSettings || loading || saving}
                    className="flex-1 rounded-lg border border-outline-variant bg-surface-container px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <button
                    onClick={() => removeSetting(setting.index)}
                    disabled={!hasLoadedSettings || loading || saving}
                    className="rounded-lg p-1.5 text-on-surface-variant hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    aria-label="Remove setting"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}

              {rawSettings.length === 0 && (
                <p className="text-center text-on-surface-variant py-4">
                  No settings configured.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add New Setting</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="admin-setting-add flex items-end gap-3">
            <div className="flex-1">
              <Input
                label="Key"
                placeholder="setting_key"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                disabled={!hasLoadedSettings || loading || saving}
              />
            </div>
            <div className="flex-1">
              <Input
                label="Value"
                placeholder="value"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                disabled={!hasLoadedSettings || loading || saving}
              />
            </div>
            <Button variant="secondary" onClick={addSetting} disabled={!hasLoadedSettings || loading || saving || !newKey.trim()}>
              Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

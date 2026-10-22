"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { toJpeg, toPng } from "html-to-image";
import {
  Download, Upload, Sparkles, User, Phone, Award, Key,
  Save, FolderOpen, Sliders, Type, RefreshCw, Trash2, Copy
} from "lucide-react";

// Pre-load typography for premium look
const FONT_LINKS = [
  "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap",
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap",
  "https://fonts.googleapis.com/css2?family=Poppins:wght@400;700;900&display=swap",
  "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;900&display=swap",
  "https://fonts.googleapis.com/css2?family=Pacifico&display=swap",
];

const FONTS = [
  { label: "Plus Jakarta", value: "'Plus Jakarta Sans', sans-serif" },
  { label: "Inter", value: "'Inter', sans-serif" },
  { label: "Poppins", value: "'Poppins', sans-serif" },
  { label: "Montserrat", value: "'Montserrat', sans-serif" },
  { label: "Pacifico", value: "'Pacifico', cursive" },
];

const PRESETS = [
  {
    id: "gold-luxury",
    name: "Luxury Gold",
    bgClass: "bg-gradient-to-br from-[#1c1917] via-[#292524] to-[#1c1917]",
    cardGlow: "shadow-[0_0_50px_-12px_rgba(234,179,8,0.3)] border-amber-500/30",
    primaryText: "text-amber-400",
    badgeClass: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  },
  {
    id: "cyberpunk-teal",
    name: "Cyberpunk Neon",
    bgClass: "bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#020617]",
    cardGlow: "shadow-[0_0_50px_-12px_rgba(20,184,166,0.3)] border-teal-500/30",
    primaryText: "text-teal-400",
    badgeClass: "bg-teal-500/10 text-teal-300 border-teal-500/30",
  },
  {
    id: "sunset-glow",
    name: "Sunset Rose",
    bgClass: "bg-gradient-to-br from-[#180815] via-[#2d0b1e] to-[#0f020a]",
    cardGlow: "shadow-[0_0_50px_-12px_rgba(244,63,94,0.3)] border-rose-500/30",
    primaryText: "text-rose-400",
    badgeClass: "bg-rose-500/10 text-rose-300 border-rose-500/30",
  },
  {
    id: "midnight-glass",
    name: "Midnight Obsidian",
    bgClass: "bg-gradient-to-br from-[#090d16] via-[#111827] to-[#030712]",
    cardGlow: "shadow-[0_0_50px_-12px_rgba(99,102,241,0.3)] border-indigo-500/30",
    primaryText: "text-indigo-400",
    badgeClass: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30",
  }
];

const COIN_COUNT_PRESETS = [4, 8, 12, 16];

interface Tagline {
  text: string;
  fontSize: number;
  color: string;
  fontFamily: string;
  fontWeight: string;
  gradient: string;
  y: number; // percentage from top (e.g. 50%)
}

interface Template {
  id: number;
  template_name: string;
  preview_image_url: string;
  layout_json: Record<string, any>;
}

export default function PromoGraphicPage() {
  const [activePreset, setActivePreset] = useState(PRESETS[0]);
  const [agentName, setAgentName] = useState("Ahmad Zaki");
  const [agentRank, setAgentRank] = useState("Platinum Partner");
  const [agentPhone, setAgentPhone] = useState("+6012-345 6789");
  const [referralCode, setReferralCode] = useState("EASTEL888");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [coinsCount, setCoinsCount] = useState(8);
  const [coinsAnimate, setCoinsAnimate] = useState(true);
  const [glowIntensity, setGlowIntensity] = useState(100); // 0-100%

  // Taglines / Slogans State
  const [taglines, setTaglines] = useState<Tagline[]>([
    {
      text: "JANA PENDAPATAN PASIF HINGGA 24%",
      fontSize: 20,
      color: "#f59e0b",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      fontWeight: "800",
      gradient: "linear-gradient(45deg, #f59e0b, #fef08a, #d97706)",
      y: 65,
    },
    {
      text: "Daftar Ejen Eastelpreneur Sekarang!",
      fontSize: 14,
      color: "#ffffff",
      fontFamily: "'Inter', sans-serif",
      fontWeight: "600",
      gradient: "",
      y: 72,
    }
  ]);
  const [selectedTaglineIdx, setSelectedTaglineIdx] = useState<number | null>(0);

  // Template/Admin States
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTemplates = async () => {
    try {
      const res = await fetch("/api/admin/marketing-templates");
      if (res.ok) {
        const data = await res.json();
        // Filter only Ejen related templates to avoid cluttering main Design Studio templates
        const filtered = (data.templates || []).filter((t: Template) =>
          t.template_name.startsWith("[Ejen Card]")
        );
        setTemplates(filtered);
      }
    } catch (e) {
      console.error("Failed to load templates", e);
    }
  };

  // Load Google Fonts
  useEffect(() => {
    FONT_LINKS.forEach((href) => {
      if (!document.querySelector(`link[href="${href}"]`)) {
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = href;
        document.head.appendChild(l);
      }
    });
    fetchTemplates();
  }, []);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setAvatarUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const updateSelectedTagline = (updates: Partial<Tagline>) => {
    if (selectedTaglineIdx === null) return;
    setTaglines((prev) =>
      prev.map((t, idx) => (idx === selectedTaglineIdx ? { ...t, ...updates } : t))
    );
  };

  const deleteTagline = (idx: number) => {
    setTaglines((prev) => prev.filter((_, i) => i !== idx));
    if (selectedTaglineIdx === idx) {
      setSelectedTaglineIdx(null);
    } else if (selectedTaglineIdx !== null && selectedTaglineIdx > idx) {
      setSelectedTaglineIdx(selectedTaglineIdx - 1);
    }
  };

  const addTagline = () => {
    const newTag: Tagline = {
      text: "Sertai Kami Hari Ini!",
      fontSize: 16,
      color: "#ffffff",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      fontWeight: "700",
      gradient: "",
      y: 50 + taglines.length * 7,
    };
    setTaglines((prev) => [...prev, newTag]);
    setSelectedTaglineIdx(taglines.length);
  };

  const handlePresetSelect = (presetId: string) => {
    const found = PRESETS.find((p) => p.id === presetId);
    if (found) setActivePreset(found);
  };

  // Save layout JSON as Ejen card template
  const saveTemplate = async () => {
    const name = prompt("Masukkan nama template Ejen:");
    if (!name) return;
    setIsSaving(true);
    let preview_image_url: string | null = null;
    if (cardRef.current) {
      try {
        preview_image_url = await toJpeg(cardRef.current, { quality: 0.4, pixelRatio: 0.5 });
      } catch (e) {
        console.error("Failed to generate preview image", e);
      }
    }

    const layout_json = {
      presetId: activePreset.id,
      agentName,
      agentRank,
      agentPhone,
      referralCode,
      avatarUrl,
      coinsCount,
      coinsAnimate,
      glowIntensity,
      taglines,
    };

    try {
      const res = await fetch("/api/admin/marketing-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_name: `[Ejen Card] ${name}`,
          layout_json,
          preview_image_url,
        }),
      });
      if (res.ok) {
        alert("Template berjaya disimpan!");
        fetchTemplates();
      } else {
        alert("Gagal menyimpan template.");
      }
    } catch {
      alert("Ralat semasa menyimpan template.");
    } finally {
      setIsSaving(false);
    }
  };

  const loadTemplate = (t: Template) => {
    const layout = t.layout_json;
    if (!layout) return;
    const preset = PRESETS.find((p) => p.id === layout.presetId) || PRESETS[0];
    setActivePreset(preset);
    setAgentName(layout.agentName || "");
    setAgentRank(layout.agentRank || "");
    setAgentPhone(layout.agentPhone || "");
    setReferralCode(layout.referralCode || "");
    setAvatarUrl(layout.avatarUrl || "");
    setCoinsCount(layout.coinsCount ?? 8);
    setCoinsAnimate(layout.coinsAnimate ?? true);
    setGlowIntensity(layout.glowIntensity ?? 100);
    setTaglines(layout.taglines || []);
    setSelectedTaglineIdx(0);
    setShowTemplates(false);
  };

  const deleteTemplate = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Padam template ini?")) return;
    try {
      const res = await fetch(`/api/admin/marketing-templates/${id}`, { method: "DELETE" });
      if (res.ok) {
        setTemplates((prev) => prev.filter((t) => t.id !== id));
      }
    } catch {}
  };

  // Export card to JPEG/PNG
  const exportCard = async (format: "jpg" | "png") => {
    if (!cardRef.current) return;
    setIsExporting(true);
    // Add brief timeout to ensure animations halt or stabilize if needed
    await new Promise((resolve) => setTimeout(resolve, 200));

    try {
      const options = {
        quality: 0.98,
        pixelRatio: 3, // FHD High Res quality
      };
      
      const dataUrl = format === "jpg" 
        ? await toJpeg(cardRef.current, options)
        : await toPng(cardRef.current, options);

      const link = document.createElement("a");
      link.download = `ejen_${referralCode || "card"}_${Date.now()}.${format}`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error(e);
      alert("Gagal memuat turun kad promo.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* CSS Styles for custom animations directly injected */}
      <style jsx global>{`
        @keyframes float-up {
          0% {
            transform: translateY(650px) rotate(0deg) scale(0.6);
            opacity: 0;
          }
          10% { opacity: 0.8; }
          90% { opacity: 0.8; }
          100% {
            transform: translateY(-50px) rotate(360deg) scale(1.1);
            opacity: 0;
          }
        }
        @keyframes gentle-sway {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(20px); }
        }
        .animate-float-coin {
          animation: float-up 10s infinite linear;
        }
      `}</style>

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-on-surface">Promo Graphic Studio</h1>
          <p className="text-sm text-on-surface-variant">
            Buat & muat turun kad promo Ejen / Rakan Kongsi Eastel dengan mudah.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTemplates(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-surface-container hover:bg-surface-container-high border border-outline-variant text-on-surface rounded-xl font-semibold transition-all shadow-sm cursor-pointer"
          >
            <FolderOpen size={16} /> Template Ejen
          </button>
          <button
            onClick={saveTemplate}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2.5 bg-surface-container hover:bg-surface-container-high border border-outline-variant text-on-surface rounded-xl font-semibold transition-all shadow-sm cursor-pointer"
          >
            {isSaving ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            Simpan
          </button>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: Controls & Input Panel (lg:col-span-5) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Preset Styles Selector */}
          <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-2">
              <Sparkles size={16} className="text-primary" /> Preset Tema
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActivePreset(p)}
                  className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all ${
                    activePreset.id === p.id
                      ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                      : "border-outline-variant bg-surface-container/50 hover:bg-surface-container-high"
                  }`}
                >
                  <span className="font-bold text-sm text-on-surface">{p.name}</span>
                  <div className="mt-2 flex gap-1 w-full">
                    <div className="h-3 w-1/3 rounded bg-amber-500/70" />
                    <div className="h-3 w-1/3 rounded bg-neutral-600/70" />
                    <div className="h-3 w-1/3 rounded bg-neutral-900" />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Agent Info Form */}
          <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-2">
              <User size={16} className="text-primary" /> Maklumat Ejen
            </h3>
            
            <div className="space-y-3">
              {/* Avatar Upload */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full border border-outline-variant bg-surface flex items-center justify-center overflow-hidden shrink-0">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User size={24} className="text-on-surface-variant" />
                  )}
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                    Gambar Profil
                  </label>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 bg-surface hover:bg-surface-container-high border border-outline text-xs font-bold rounded-lg transition-colors cursor-pointer"
                  >
                    Muat Naik Gambar
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Form Input fields */}
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">Nama Ejen</label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  className="w-full bg-surface-container px-3 py-2 border border-outline rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary"
                  placeholder="e.g. Ahmad Zaki"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1">Pangkat Ejen</label>
                  <input
                    type="text"
                    value={agentRank}
                    onChange={(e) => setAgentRank(e.target.value)}
                    className="w-full bg-surface-container px-3 py-2 border border-outline rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary"
                    placeholder="e.g. Platinum Partner"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1">No. Telefon Ejen</label>
                  <input
                    type="text"
                    value={agentPhone}
                    onChange={(e) => setAgentPhone(e.target.value)}
                    className="w-full bg-surface-container px-3 py-2 border border-outline rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary"
                    placeholder="e.g. +6012-345 6789"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">Kod Rujukan Ejen</label>
                <input
                  type="text"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value)}
                  className="w-full bg-surface-container px-3 py-2 border border-outline rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary"
                  placeholder="e.g. EASTEL888"
                />
              </div>
            </div>
          </div>

          {/* Slogans & Tagline Customizer */}
          <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-5 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-2">
                <Type size={16} className="text-primary" /> Tagline / Slogan
              </h3>
              <button
                onClick={addTagline}
                className="text-xs bg-primary text-white font-bold px-2 py-1.5 rounded-lg hover:bg-primary/95 transition-colors cursor-pointer"
              >
                + Tambah
              </button>
            </div>

            <div className="space-y-3">
              {/* Taglines List */}
              <div className="flex gap-2 overflow-x-auto pb-2 border-b border-outline-variant">
                {taglines.map((t, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedTaglineIdx(idx)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg shrink-0 border transition-all ${
                      selectedTaglineIdx === idx
                        ? "bg-primary/20 text-primary border-primary"
                        : "bg-surface-container/40 text-on-surface border-transparent"
                    }`}
                  >
                    Tagline {idx + 1}
                  </button>
                ))}
              </div>

              {selectedTaglineIdx !== null && taglines[selectedTaglineIdx] && (
                <div className="space-y-3 pt-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={taglines[selectedTaglineIdx].text}
                      onChange={(e) => updateSelectedTagline({ text: e.target.value })}
                      className="flex-1 bg-surface-container px-3 py-2 border border-outline rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary"
                    />
                    <button
                      onClick={() => deleteTagline(selectedTaglineIdx)}
                      className="p-2 border border-outline hover:bg-red-500/10 text-red-500 rounded-xl transition-colors cursor-pointer"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                        Font Family
                      </label>
                      <select
                        value={taglines[selectedTaglineIdx].fontFamily}
                        onChange={(e) => updateSelectedTagline({ fontFamily: e.target.value })}
                        className="w-full bg-surface-container px-2 py-1.5 border border-outline rounded-lg text-xs"
                      >
                        {FONTS.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                        Saiz ({taglines[selectedTaglineIdx].fontSize}px)
                      </label>
                      <input
                        type="range"
                        min="10"
                        max="36"
                        value={taglines[selectedTaglineIdx].fontSize}
                        onChange={(e) => updateSelectedTagline({ fontSize: Number(e.target.value) })}
                        className="w-full accent-primary"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                        Warna
                      </label>
                      <div className="flex gap-2 items-center">
                        <input
                          type="color"
                          value={taglines[selectedTaglineIdx].color}
                          onChange={(e) => updateSelectedTagline({ color: e.target.value, gradient: "" })}
                          className="w-8 h-8 rounded-full border-2 border-outline-variant p-0 cursor-pointer overflow-hidden"
                        />
                        <span className="text-xs uppercase font-mono text-on-surface-variant">
                          {taglines[selectedTaglineIdx].color}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                        Kedudukan Y ({taglines[selectedTaglineIdx].y}%)
                      </label>
                      <input
                        type="range"
                        min="20"
                        max="90"
                        value={taglines[selectedTaglineIdx].y}
                        onChange={(e) => updateSelectedTagline({ y: Number(e.target.value) })}
                        className="w-full accent-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                      Gradient Preset
                    </label>
                    <select
                      value={taglines[selectedTaglineIdx].gradient}
                      onChange={(e) => updateSelectedTagline({ gradient: e.target.value })}
                      className="w-full bg-surface-container px-2 py-1.5 border border-outline rounded-lg text-xs"
                    >
                      <option value="">Tiada (Solid Color)</option>
                      <option value="linear-gradient(45deg, #bf953f, #fcf6ba, #b38728, #fbf5b7, #aa771c)">Emas Mewah</option>
                      <option value="linear-gradient(45deg, #2193b0, #6dd5ed)">Biru Samudera</option>
                      <option value="linear-gradient(45deg, #ff416c, #ff4b2b)">Senja Merah</option>
                      <option value="linear-gradient(45deg, #ece9e6, #ffffff)">Perak Bersinar</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Animation & Visuals Panel */}
          <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-2">
              <Sliders size={16} className="text-primary" /> Efek Visual
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-on-surface">Syiling Emas Terapung</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={coinsAnimate}
                    onChange={(e) => setCoinsAnimate(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              {coinsAnimate && (
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                    Jumlah Syiling ({coinsCount})
                  </label>
                  <div className="flex gap-2">
                    {COIN_COUNT_PRESETS.map((val) => (
                      <button
                        key={val}
                        onClick={() => setCoinsCount(val)}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                          coinsCount === val
                            ? "bg-primary text-white border-primary"
                            : "bg-surface-container/50 border-outline-variant hover:bg-surface-container-high text-on-surface"
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Kekuatan Neon Glow ({glowIntensity}%)
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={glowIntensity}
                  onChange={(e) => setGlowIntensity(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Canvas Live Preview (lg:col-span-7) */}
        <div className="lg:col-span-7 flex flex-col items-center gap-6">
          
          {/* High Res Export formats selection */}
          <div className="flex gap-3 justify-center bg-surface-container/30 border border-outline-variant p-3.5 rounded-2xl w-full max-w-[400px]">
            <button
              onClick={() => exportCard("jpg")}
              disabled={isExporting}
              className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/95 text-white font-bold py-2.5 rounded-xl transition-all shadow shadow-primary/20 disabled:opacity-50 text-sm cursor-pointer"
            >
              {isExporting ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <Download size={16} />
              )}
              Muat Turun JPG (FHD)
            </button>
            <button
              onClick={() => exportCard("png")}
              disabled={isExporting}
              className="flex-1 flex items-center justify-center gap-2 bg-surface-container-high hover:bg-surface-variant border border-outline-variant text-on-surface font-bold py-2.5 rounded-xl transition-all disabled:opacity-50 text-sm cursor-pointer"
            >
              PNG (Transparensi)
            </button>
          </div>

          {/* Live Card Container Wrapper */}
          <div className="admin-design-preview-scroll w-full p-4 bg-surface-container border border-outline-variant rounded-xl relative max-h-[700px]">
            
            {/* The Live Render Card (W:400px, H:600px aspect-ratio) */}
            <div
              ref={cardRef}
              data-admin-artwork
              id="ejenPromoCard"
              className={`w-[400px] h-[600px] relative rounded-3xl overflow-hidden shrink-0 border transition-all flex flex-col items-center p-6 ${activePreset.bgClass}`}
              style={{
                borderColor: `rgba(245, 158, 11, ${glowIntensity / 100 * 0.3})`,
                boxShadow: glowIntensity > 0 
                  ? `0 0 ${glowIntensity / 2}px -12px rgba(245, 158, 11, ${glowIntensity / 100 * 0.35})`
                  : 'none',
              }}
            >
              
              {/* Premium Card Border Light Reflection (Glass effect) */}
              <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 pointer-events-none z-10" />

              {/* Floating Syiling Animation Layer */}
              {coinsAnimate && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden z-[2]">
                  {Array.from({ length: coinsCount }).map((_, i) => {
                    const delay = (i * 1.5).toFixed(1);
                    const left = (10 + (i * 85) / coinsCount).toFixed(0);
                    const size = (16 + (i % 3) * 8); // 16px - 32px
                    const rotateStart = (i * 45).toFixed(0);
                    return (
                      <div
                        key={i}
                        className="absolute animate-float-coin"
                        style={{
                          left: `${left}%`,
                          width: `${size}px`,
                          height: `${size}px`,
                          animationDelay: `${delay}s`,
                          animationDuration: "9s",
                          transform: `rotate(${rotateStart}deg)`,
                          opacity: 0,
                        }}
                      >
                        {/* Gold Coin SVG Representation */}
                        <svg viewBox="0 0 100 100" className="w-full h-full filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                          <circle cx="50" cy="50" r="45" fill="url(#goldGradient)" stroke="#d97706" strokeWidth="3" />
                          <circle cx="50" cy="50" r="35" fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 3" />
                          <text x="50" y="62" fontSize="36" fontWeight="bold" fill="#b45309" textAnchor="middle">RM</text>
                          <defs>
                            <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#fef08a" />
                              <stop offset="50%" stopColor="#f59e0b" />
                              <stop offset="100%" stopColor="#b45309" />
                            </linearGradient>
                          </defs>
                        </svg>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Premium Branding Header */}
              <div className="w-full flex justify-between items-center z-10 border-b border-white/5 pb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center font-bold text-black text-base shadow-lg shadow-amber-500/20">
                    E
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[13px] font-black tracking-widest text-white leading-none">EASTEL</span>
                    <span className="text-[9px] text-amber-400 font-bold uppercase tracking-wider leading-none">MOBILE</span>
                  </div>
                </div>
                {agentRank && (
                  <span className={`px-2.5 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider border shrink-0 ${activePreset.badgeClass}`}>
                    🏆 {agentRank}
                  </span>
                )}
              </div>

              {/* Card Center: Ejen Profile Avatar and Details */}
              <div className="mt-8 flex flex-col items-center z-10">
                <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-amber-400 to-amber-200 shadow-xl shadow-black/40">
                  <div className="w-full h-full rounded-full bg-neutral-900 overflow-hidden flex items-center justify-center">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <User size={40} className="text-neutral-500" />
                    )}
                  </div>
                </div>

                <h2 className="mt-4 text-xl font-extrabold text-white text-center leading-tight tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                  {agentName || "Nama Ejen"}
                </h2>
                
                {agentPhone && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-400 font-medium tracking-wide drop-shadow">
                    <Phone size={10} /> {agentPhone}
                  </p>
                )}
              </div>

              {/* Slogans and Custom Taglines rendered inline with absolute Y spacing percentage */}
              {taglines.map((t, idx) => (
                <div
                  key={idx}
                  className="absolute left-6 right-6 text-center leading-tight z-10 select-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                  style={{
                    top: `${t.y}%`,
                  }}
                >
                  <p
                    style={{
                      fontFamily: t.fontFamily,
                      fontSize: `${t.fontSize}px`,
                      fontWeight: t.fontWeight,
                      textShadow: "0 2px 8px rgba(0,0,0,0.7)",
                      ...(t.gradient
                        ? { background: t.gradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }
                        : { color: t.color }),
                    }}
                  >
                    {t.text}
                  </p>
                </div>
              ))}

              {/* Card Footer: Referral Registry Code */}
              <div className="absolute bottom-6 left-6 right-6 z-10 bg-black/40 backdrop-blur-md border border-white/5 p-3 rounded-2xl flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider text-neutral-400 font-semibold">Kod Rujukan</span>
                  <span className="text-sm font-black tracking-widest text-white">{referralCode || "EASTEL"}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[8px] text-amber-400 font-bold uppercase tracking-wider bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                    24% Bonus
                  </span>
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>

      {/* Templates Load / Delete Modal */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-surface-container border border-outline-variant w-full max-w-2xl rounded-3xl p-6 shadow-2xl space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-on-surface">Template Ejen Simpanan</h2>
              <button
                onClick={() => setShowTemplates(false)}
                className="px-3.5 py-1.5 bg-surface-container-high hover:bg-surface-variant border border-outline rounded-xl font-semibold transition-colors cursor-pointer text-sm"
              >
                Tutup
              </button>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto pr-1">
              {templates.map((t) => (
                <div
                  key={t.id}
                  onClick={() => loadTemplate(t)}
                  className="group relative cursor-pointer bg-surface border border-outline-variant rounded-2xl overflow-hidden hover:border-primary transition-colors flex flex-col"
                >
                  <button
                    onClick={(e) => deleteTemplate(t.id, e)}
                    className="absolute top-2.5 right-2.5 z-10 p-1.5 bg-red-600/90 hover:bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer flex items-center shadow-lg"
                    title="Padam"
                  >
                    <Trash2 size={12} />
                  </button>
                  <div className="h-44 bg-surface-container-highest flex items-center justify-center overflow-hidden">
                    {t.preview_image_url ? (
                      <img src={t.preview_image_url} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <Award size={32} className="text-on-surface-variant/40" />
                    )}
                  </div>
                  <div className="p-3 text-xs font-bold text-center text-on-surface bg-surface-container-high truncate">
                    {t.template_name.replace("[Ejen Card] ", "")}
                  </div>
                </div>
              ))}
              {templates.length === 0 && (
                <p className="col-span-full text-center text-on-surface-variant py-8 italic text-sm">
                  Tiada template Ejen disimpan lagi.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

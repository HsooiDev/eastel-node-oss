"use client";

import { useState, useRef, useEffect } from "react";
import { toJpeg, toPng } from "html-to-image";
import {
  Download, Upload, Image as ImageIcon, Wand2, Type,
  Loader2, Trash2, Save, FolderOpen, SlidersHorizontal,
  AlignLeft, AlignCenter, AlignRight, Layers, Copy, Sparkles, Plus,
  Undo2, Redo2, Grid2X2, Magnet, ZoomIn, ZoomOut, Lock, Unlock,
  Eye, EyeOff, Share2, X,
} from "lucide-react";
import {
  fitCanvasZoom,
  MarketingEditorHistory,
  normalizeMarketingTemplate,
  removeChromaPixels,
  snapCoordinate,
  type MarketingEditorFilters,
  type MarketingImageLayer,
  type MarketingShapeLayer,
  type MarketingTextLayer,
} from "@/lib/marketing-editor-model";

const FONT_LINKS = [
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap",
  "https://fonts.googleapis.com/css2?family=Poppins:wght@400;700;900&display=swap",
  "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,700&display=swap",
  "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;900&display=swap",
  "https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&family=Open+Sans:wght@400;700;800&family=Lato:wght@400;700;900&family=Oswald:wght@400;700&family=Raleway:wght@400;700;900&family=Merriweather:wght@400;700;900&family=Pacifico&family=Caveat:wght@400;700&display=swap",
];

const FONTS = [
  { label: "System Default", value: "sans-serif" },
  { label: "Inter", value: "'Inter', sans-serif" },
  { label: "Poppins", value: "'Poppins', sans-serif" },
  { label: "Playfair Display", value: "'Playfair Display', serif" },
  { label: "Montserrat", value: "'Montserrat', sans-serif" },
  { label: "Roboto", value: "'Roboto', sans-serif" },
  { label: "Open Sans", value: "'Open Sans', sans-serif" },
  { label: "Lato", value: "'Lato', sans-serif" },
  { label: "Oswald", value: "'Oswald', sans-serif" },
  { label: "Raleway", value: "'Raleway', sans-serif" },
  { label: "Merriweather", value: "'Merriweather', serif" },
  { label: "Pacifico", value: "'Pacifico', cursive" },
  { label: "Caveat", value: "'Caveat', cursive" },
];

const GRADIENTS = [
  { label: "None", value: "" },
  { label: "Gold", value: "linear-gradient(45deg, #bf953f, #fcf6ba, #b38728, #fbf5b7, #aa771c)" },
  { label: "Ocean", value: "linear-gradient(45deg, #2193b0, #6dd5ed)" },
  { label: "Sunset", value: "linear-gradient(45deg, #ff416c, #ff4b2b)" },
  { label: "Purple", value: "linear-gradient(45deg, #da22ff, #9733ee)" },
  { label: "Silver", value: "linear-gradient(45deg, #ece9e6, #ffffff)" },
  { label: "Fire", value: "linear-gradient(45deg, #f12711, #f5af19)" },
  { label: "Nature", value: "linear-gradient(45deg, #00b09b, #96c93d)" },
];

type TextLayer = MarketingTextLayer;
type ImageLayer = MarketingImageLayer;
type ShapeLayer = MarketingShapeLayer;
type LayerState = Pick<MarketingTextLayer, "opacity" | "rotation" | "locked" | "visible">;

type Layer = TextLayer | ImageLayer | ShapeLayer;

type EditorSnapshot = {
  preset: keyof typeof PRESETS;
  customSize: { width: number; height: number };
  useCustomSize: boolean;
  bgImage: string | null;
  bgType: "image" | "color" | "gradient";
  bgColor: string;
  bgGradient: string;
  filters: MarketingEditorFilters;
  textLayers: TextLayer[];
  imageLayers: ImageLayer[];
  shapeLayers: ShapeLayer[];
  snapToGrid: boolean;
  gridSize: number;
};

type Template = {
  id: number;
  template_name: string;
  preview_image_url: string;
  layout_json: Record<string, unknown>;
};

const MODELS = {
  "imagen-3.0-generate-001": { name: "Imagen 3", kind: "image" as const, dailyLimit: 100 },
  "imagen-3.0-fast-generate-001": { name: "Imagen 3 Fast", kind: "image" as const, dailyLimit: 200 },
  "gemini-3.1-flash-lite-preview": { name: "Gemini 3.1 Flash Lite", kind: "text" as const, dailyLimit: 1500 },
  "gemini-2.5-flash": { name: "Gemini 2.5 Flash", kind: "text" as const, dailyLimit: 1500 },
  "gemini-2.0-pro-exp-02-05": { name: "Gemini 2.0 Pro", kind: "text" as const, dailyLimit: 50 },
};

const PRESETS = {
  mobile: { width: 400, height: 800, label: "Mobile" },
  tablet: { width: 800, height: 1000, label: "Tablet" },
  desktop: { width: 1200, height: 800, label: "Desktop" },
};

const QUALITIES = {
  standard: { label: "Standard (1x)", pixelRatio: 1 },
  hd: { label: "HD (1.5x)", pixelRatio: 1.5 },
  fhd: { label: "FHD (2x)", pixelRatio: 2 },
  "2k": { label: "2K (2.5x)", pixelRatio: 2.5 },
  "4k": { label: "4K (4x)", pixelRatio: 4 },
};

export default function MarketingDesignPage() {
  const [bgImages, setBgImages] = useState<{ filename: string; url: string }[]>([]);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [bgType, setBgType] = useState<"image" | "color" | "gradient">("image");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [bgGradient, setBgGradient] = useState("linear-gradient(45deg, #2193b0, #6dd5ed)");
  const [filters, setFilters] = useState<MarketingEditorFilters>({
    brightness: 100, contrast: 100, grayscale: 0, blur: 0,
    bgFit: "cover", bgScale: 100, bgPosX: 50, bgPosY: 50,
  });

  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);
  const [imageLayers, setImageLayers] = useState<ImageLayer[]>([]);
  const [shapeLayers, setShapeLayers] = useState<ShapeLayer[]>([]);

  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [selectedLayerType, setSelectedLayerType] = useState<"text" | "image" | "shape">("text");

  const [preset, setPreset] = useState<keyof typeof PRESETS>("mobile");
  const [quality, setQuality] = useState<keyof typeof QUALITIES>("fhd");
  const [customSize, setCustomSize] = useState({ width: 400, height: 800 });
  const [useCustomSize, setUseCustomSize] = useState(false);

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiType, setAiType] = useState<"text" | "image">("image");
  const [aiModel, setAiModel] = useState<string>("imagen-3.0-generate-001");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiSlogans, setAiSlogans] = useState<string[]>([]);

  const [usageTracker, setUsageTracker] = useState<Record<string, number>>({});
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [gridVisible, setGridVisible] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [gridSize, setGridSize] = useState(10);
  const [zoom, setZoom] = useState(1);
  const [exportFormat, setExportFormat] = useState<"jpg" | "png">("jpg");
  const [isSharing, setIsSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState("");
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [notice, setNotice] = useState("");
  const [historyRevision, setHistoryRevision] = useState(0);
  const [chromaColor, setChromaColor] = useState("#ffffff");
  const [chromaTolerance, setChromaTolerance] = useState(15);

  const canvasWidth = useCustomSize ? customSize.width : PRESETS[preset].width;
  const canvasHeight = useCustomSize ? customSize.height : PRESETS[preset].height;

  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const shareDialogRef = useRef<HTMLDialogElement>(null);
  const historyRef = useRef(new MarketingEditorHistory<EditorSnapshot>());
  const fitMode = useRef(true);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragOrigin = useRef({ x: 0, y: 0 });
  const dragZoom = useRef(1);
  const dragLayerId = useRef<string | null>(null);
  const dragLayerType = useRef<"text" | "image" | "shape">("text");
  const dragHistoryRecorded = useRef(false);
  const controlHistoryActive = useRef(false);
  const noticeTimer = useRef<number | null>(null);

  useEffect(() => {
    FONT_LINKS.forEach((href) => {
      if (!document.querySelector(`link[href="${href}"]`)) {
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = href;
        document.head.appendChild(l);
      }
    });
    fetchBgImages();
    fetchStats();
    fetchTemplates();
  }, []);

  useEffect(() => {
    const dialog = shareDialogRef.current;
    if (!dialog) return;
    if (showShareDialog && !dialog.open) dialog.showModal();
    else if (!showShareDialog && dialog.open) dialog.close();
  }, [showShareDialog]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const fit = () => {
      if (!fitMode.current) return;
      setZoom(fitCanvasZoom(viewport.clientWidth, viewport.clientHeight, canvasWidth, canvasHeight));
    };
    fit();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [canvasWidth, canvasHeight]);

  useEffect(() => {
    return () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.matches("input, textarea, select, [role='textbox']")) return;

      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (command && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (command && key === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (command && key === "d") {
        event.preventDefault();
        duplicateLayer();
        return;
      }
      if (!selectedLayerId) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteLayer();
        return;
      }
      const delta = snapToGrid ? gridSize * (event.shiftKey ? 10 : 1) : event.shiftKey ? 10 : 1;
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const current = allLayers.find((layer) => layer.id === selectedLayerId);
      if (!current || current.locked) return;
      event.preventDefault();
      recordHistory();
      const nextX = current.x + (event.key === "ArrowLeft" ? -delta : event.key === "ArrowRight" ? delta : 0);
      const nextY = current.y + (event.key === "ArrowUp" ? -delta : event.key === "ArrowDown" ? delta : 0);
      updateLayerPosition(current.id, current.type, nextX, nextY);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function fetchStats() {
    try {
      const res = await fetch("/api/admin/marketing-ai/stats");
      if (res.ok) {
        const data = await res.json();
        setUsageTracker(data.stats || {});
      }
    } catch {}
  }

  async function fetchTemplates() {
    try {
      const res = await fetch("/api/admin/marketing-templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch {}
  }

  async function fetchBgImages() {
    try {
      const res = await fetch("/api/admin/posters");
      if (res.ok) {
        const data = await res.json();
        setBgImages(data.images || []);
      }
    } catch {}
  }

  function captureEditorDocument(): EditorSnapshot {
    return {
      preset,
      customSize: { ...customSize },
      useCustomSize,
      bgImage,
      bgType,
      bgColor,
      bgGradient,
      filters: { ...filters },
      textLayers: textLayers.map((layer) => ({ ...layer })),
      imageLayers: imageLayers.map((layer) => ({ ...layer })),
      shapeLayers: shapeLayers.map((layer) => ({ ...layer })),
      snapToGrid,
      gridSize,
    };
  }

  function recordHistory() {
    if (controlHistoryActive.current) return;
    historyRef.current.record(captureEditorDocument());
    setHistoryRevision((revision) => revision + 1);
  }

  function beginControlHistory() {
    if (controlHistoryActive.current) return;
    recordHistory();
    controlHistoryActive.current = true;
  }

  function endControlHistory() {
    controlHistoryActive.current = false;
  }

  function applyEditorDocument(snapshot: EditorSnapshot) {
    setPreset(snapshot.preset);
    setCustomSize({ ...snapshot.customSize });
    setUseCustomSize(snapshot.useCustomSize);
    setBgImage(snapshot.bgImage);
    setBgType(snapshot.bgType);
    setBgColor(snapshot.bgColor);
    setBgGradient(snapshot.bgGradient);
    setFilters({ ...snapshot.filters });
    setTextLayers(snapshot.textLayers.map((layer) => ({ ...layer })));
    setImageLayers(snapshot.imageLayers.map((layer) => ({ ...layer })));
    setShapeLayers(snapshot.shapeLayers.map((layer) => ({ ...layer })));
    setSnapToGrid(snapshot.snapToGrid);
    setSelectedLayerId(null);
    fitMode.current = true;
  }

  function undo() {
    const snapshot = historyRef.current.undo(captureEditorDocument());
    if (!snapshot) return;
    applyEditorDocument(snapshot);
    setHistoryRevision((revision) => revision + 1);
  }

  function redo() {
    const snapshot = historyRef.current.redo(captureEditorDocument());
    if (!snapshot) return;
    applyEditorDocument(snapshot);
    setHistoryRevision((revision) => revision + 1);
  }

  function notifyEditor(message: string) {
    setNotice(message);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 3500);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.[0]) return;
    const formData = new FormData();
    formData.append("file", e.target.files[0]);
    try {
      const res = await fetch("/api/admin/posters", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        recordHistory();
        setBgImages((prev) => [data, ...prev]);
        setBgImage(data.url);
        setBgType("image");
      }
    } catch {}
    e.target.value = "";
  }

  // ── Layer helpers ─────────────────────────────────────────────
  function getMaxZ() {
    return Math.max(...textLayers.map((l) => l.zIndex), ...imageLayers.map((l) => l.zIndex), ...shapeLayers.map((l) => l.zIndex), 0);
  }

  function addTextLayer(customText = "New Text") {
    const layer: TextLayer = {
      id: "t_" + Date.now() + Math.floor(Math.random() * 1000),
      type: "text",
      text: customText,
      x: 50, y: 50,
      fontSize: 32,
      color: "#ffffff",
      gradient: "",
      fontFamily: "'Inter', sans-serif",
      fontWeight: "700",
      textAlign: "left",
      shadow: true,
      stroke: false,
      strokeColor: "#000000",
      zIndex: getMaxZ() + 1,
      visible: true,
      locked: false,
    };
    recordHistory();
    setTextLayers((prev) => [...prev, layer]);
    setSelectedLayerId(layer.id);
    setSelectedLayerType("text");
  }

  function addTextFromAI(raw: string) {
    const cleaned = raw.replace(/^[-*•✨\d.]+\s*/, "").trim();
    addTextLayer(cleaned);
  }

  function addImageLayer(url: string) {
    const layer: ImageLayer = {
      id: "i_" + Date.now() + Math.floor(Math.random() * 1000),
      type: "image",
      url,
      x: 50, y: 50,
      width: 200,
      zIndex: getMaxZ() + 1,
      visible: true,
      locked: false,
    };
    recordHistory();
    setImageLayers((prev) => [...prev, layer]);
    setSelectedLayerId(layer.id);
    setSelectedLayerType("image");
  }

  function addShapeLayer(shapeType: ShapeLayer["shapeType"]) {
    const layer: ShapeLayer = {
      id: "s_" + Date.now() + Math.floor(Math.random() * 1000),
      type: "shape",
      shapeType,
      x: 100,
      y: 100,
      width: shapeType === "line" ? 200 : 120,
      height: shapeType === "line" ? 4 : 120,
      fillColor: "#3498db",
      strokeColor: "#2980b9",
      strokeWidth: shapeType === "line" ? 4 : 0,
      borderRadius: 0,
      zIndex: getMaxZ() + 1,
      opacity: 1,
      rotation: 0,
      locked: false,
      visible: true,
    };
    recordHistory();
    setShapeLayers((prev) => [...prev, layer]);
    setSelectedLayerId(layer.id);
    setSelectedLayerType("shape");
  }

  function updateText(updates: Partial<TextLayer>) {
    if (!selectedLayerId) return;
    recordHistory();
    setTextLayers((prev) => prev.map((l) => (l.id === selectedLayerId ? { ...l, ...updates } : l)));
  }

  function updateImage(updates: Partial<ImageLayer>) {
    if (!selectedLayerId) return;
    recordHistory();
    setImageLayers((prev) => prev.map((l) => (l.id === selectedLayerId ? { ...l, ...updates } : l)));
  }

  function updateShape(updates: Partial<ShapeLayer>) {
    if (!selectedLayerId) return;
    recordHistory();
    setShapeLayers((prev) => prev.map((layer) => (layer.id === selectedLayerId ? { ...layer, ...updates } : layer)));
  }

  function updateLayerPosition(id: string, type: Layer["type"], x: number, y: number) {
    const position = {
      x: snapCoordinate(x, snapToGrid, gridSize),
      y: snapCoordinate(y, snapToGrid, gridSize),
    };
    if (type === "text") setTextLayers((prev) => prev.map((layer) => layer.id === id ? { ...layer, ...position } : layer));
    else if (type === "image") setImageLayers((prev) => prev.map((layer) => layer.id === id ? { ...layer, ...position } : layer));
    else setShapeLayers((prev) => prev.map((layer) => layer.id === id ? { ...layer, ...position } : layer));
  }

  function duplicateLayer() {
    if (!selectedLayerId) return;
    const selected = allLayers.find((layer) => layer.id === selectedLayerId);
    if (!selected) return;
    const newZ = getMaxZ() + 1;
    recordHistory();
    if (selectedLayerType === "text") {
      const src = textLayers.find((l) => l.id === selectedLayerId);
      if (!src) return;
      const newId = "t_" + Date.now() + Math.floor(Math.random() * 1000);
      setTextLayers((prev) => [...prev, { ...src, id: newId, x: src.x + 20, y: src.y + 20, zIndex: newZ }]);
      setSelectedLayerId(newId);
    } else if (selectedLayerType === "image") {
      const src = imageLayers.find((l) => l.id === selectedLayerId);
      if (!src) return;
      const newId = "i_" + Date.now() + Math.floor(Math.random() * 1000);
      setImageLayers((prev) => [...prev, { ...src, id: newId, x: src.x + 20, y: src.y + 20, zIndex: newZ }]);
      setSelectedLayerId(newId);
    } else {
      const src = shapeLayers.find((l) => l.id === selectedLayerId);
      if (!src) return;
      const newId = "s_" + Date.now() + Math.floor(Math.random() * 1000);
      setShapeLayers((prev) => [...prev, { ...src, id: newId, x: src.x + 20, y: src.y + 20, zIndex: newZ }]);
      setSelectedLayerId(newId);
    }
  }

  function deleteLayer() {
    if (!selectedLayerId) return;
    recordHistory();
    if (selectedLayerType === "text") setTextLayers((prev) => prev.filter((l) => l.id !== selectedLayerId));
    else if (selectedLayerType === "image") setImageLayers((prev) => prev.filter((l) => l.id !== selectedLayerId));
    else setShapeLayers((prev) => prev.filter((l) => l.id !== selectedLayerId));
    setSelectedLayerId(null);
  }

  function moveLayer(dir: 1 | -1) {
    if (!selectedLayerId) return;
    recordHistory();
    if (selectedLayerType === "text")
      setTextLayers((prev) => prev.map((l) => (l.id === selectedLayerId ? { ...l, zIndex: l.zIndex + dir } : l)));
    else if (selectedLayerType === "image")
      setImageLayers((prev) => prev.map((l) => (l.id === selectedLayerId ? { ...l, zIndex: l.zIndex + dir } : l)));
    else setShapeLayers((prev) => prev.map((l) => (l.id === selectedLayerId ? { ...l, zIndex: l.zIndex + dir } : l)));
  }

  // ── Drag ─────────────────────────────────────────────────────
  function handlePointerDown(e: React.PointerEvent, id: string, type: Layer["type"]) {
    e.stopPropagation();
    setSelectedLayerId(id);
    setSelectedLayerType(type);
    const layer = allLayers.find((item) => item.id === id);
    if (!layer || layer.locked || layer.visible === false) return;
    isDragging.current = true;
    dragHistoryRecorded.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY };
    dragOrigin.current = { x: layer.x, y: layer.y };
    dragZoom.current = zoom;
    dragLayerId.current = id;
    dragLayerType.current = type;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!isDragging.current || !dragLayerId.current) return;
    const dx = (e.clientX - dragStart.current.x) / Math.max(dragZoom.current, 0.01);
    const dy = (e.clientY - dragStart.current.y) / Math.max(dragZoom.current, 0.01);
    const id = dragLayerId.current;
    const current = allLayers.find((layer) => layer.id === id);
    if (!current || current.locked) return;
    if (!dragHistoryRecorded.current && (dx !== 0 || dy !== 0)) {
      recordHistory();
      dragHistoryRecorded.current = true;
    }
    updateLayerPosition(id, dragLayerType.current, dragOrigin.current.x + dx, dragOrigin.current.y + dy);
  }

  function handlePointerUp(e: React.PointerEvent) {
    isDragging.current = false;
    dragLayerId.current = null;
    dragHistoryRecorded.current = false;
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }

  // ── AI ────────────────────────────────────────────────────────
  async function handleGenerateAI() {
    if (!aiPrompt) return;
    setIsGenerating(true);
    setAiSlogans([]);
    try {
      const res = await fetch("/api/admin/marketing-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: aiType, prompt: aiPrompt, model: aiModel }),
      });
      const data = await res.json();
      if (res.ok) {
        fetchStats();
        if (aiType === "image") {
          recordHistory();
          setBgImages((prev) => [{ filename: data.filename, url: data.url }, ...prev]);
          setBgImage(data.url);
          setBgType("image");
        } else {
          const lines = (data.text as string)
            .split("\n")
            .map((l: string) => l.trim())
            .filter(Boolean);
          setAiSlogans(lines);
        }
      } else {
        alert("Error: " + data.message);
      }
    } catch {
      alert("Failed to contact AI API.");
    } finally {
      setIsGenerating(false);
    }
  }

  // ── Export ────────────────────────────────────────────────────
  async function captureCanvasImage(format: "jpg" | "png", pixelRatio: number, quality = 0.95): Promise<string | null> {
    if (!canvasRef.current) return null;
    const prevId = selectedLayerId;
    const grid = canvasRef.current.querySelector<HTMLElement>("[data-editor-grid]");
    const gridWasHidden = grid?.hidden ?? false;
    if (grid) grid.hidden = true;
    setSelectedLayerId(null);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    try {
      if (format === "png") {
        return await toPng(canvasRef.current, {
          pixelRatio,
          style: { transform: "scale(1)", transformOrigin: "top left" },
        });
      }
      return await toJpeg(canvasRef.current, {
        quality,
        pixelRatio,
        backgroundColor: "#ffffff",
        style: { transform: "scale(1)", transformOrigin: "top left" },
      });
    } finally {
      if (grid) grid.hidden = gridWasHidden;
      setSelectedLayerId(prevId);
    }
  }

  async function exportPoster() {
    try {
      const dataUrl = await captureCanvasImage(exportFormat, QUALITIES[quality].pixelRatio);
      if (!dataUrl) throw new Error("The poster canvas is not ready.");
      const link = document.createElement("a");
      link.download = `poster_${Date.now()}.${exportFormat}`;
      link.href = dataUrl;
      link.click();
      notifyEditor(`Poster exported as ${exportFormat.toUpperCase()}.`);
    } catch {
      notifyEditor("Failed to export image.");
    }
  }

  async function copyPoster() {
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        notifyEditor("Image clipboard is not available in this browser.");
        return;
      }
      const dataUrl = await captureCanvasImage("png", 1);
      if (!dataUrl) throw new Error("The poster canvas is not ready.");
      const image = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [image.type]: image })]);
      notifyEditor("Poster copied to clipboard.");
    } catch {
      notifyEditor("Could not copy the poster. Try downloading it instead.");
    }
  }

  async function createShareLink() {
    setShareError("");
    setIsSharing(true);
    try {
      const dataUrl = await captureCanvasImage("jpg", 1, 0.9);
      if (!dataUrl) throw new Error("The poster canvas is not ready.");
      const blob = await (await fetch(dataUrl)).blob();
      if (blob.size > 5 * 1024 * 1024) throw new Error("The shared image exceeds the 5 MB limit.");
      const form = new FormData();
      form.append("file", new File([blob], "poster-share.jpg", { type: "image/jpeg" }));
      const response = await fetch("/api/admin/marketing-shares", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok || result.status !== "success" || typeof result.url !== "string") {
        throw new Error(typeof result.message === "string" ? result.message : "Failed to create a share link.");
      }
      setShareUrl(new URL(result.url, window.location.origin).toString());
    } catch (cause) {
      setShareError(cause instanceof Error ? cause.message : "Failed to create a share link.");
    } finally {
      setIsSharing(false);
    }
  }

  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      notifyEditor("Share link copied.");
    } catch {
      setShareError("Could not copy the link. Select and copy it manually.");
    }
  }

  async function pickChromaColor() {
    const EyeDropperConstructor = (window as Window & {
      EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
    }).EyeDropper;
    if (!EyeDropperConstructor) {
      notifyEditor("The color picker requires a supported Chromium browser.");
      return;
    }
    try {
      const selected = await new EyeDropperConstructor().open();
      setChromaColor(selected.sRGBHex);
    } catch {
      // Escape cancels the native picker; leave the selected color unchanged.
    }
  }

  async function eraseImageBackground() {
    const layer = imageLayers.find((item) => item.id === selectedLayerId);
    if (!layer) return;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Image canvas is unavailable.");
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const cleanPixels = removeChromaPixels(pixels.data, chromaColor, chromaTolerance);
        if (!cleanPixels) throw new Error("Choose a valid color before erasing.");
        pixels.data.set(cleanPixels);
        context.putImageData(pixels, 0, 0);
        const cleanedUrl = canvas.toDataURL("image/png");
        recordHistory();
        setImageLayers((current) => current.map((item) => item.id === layer.id ? { ...item, url: cleanedUrl } : item));
        notifyEditor("Background color removed from the selected image.");
      } catch {
        notifyEditor("Could not edit this image. It may be cross-origin protected.");
      }
    };
    image.onerror = () => notifyEditor("Could not load the selected image.");
    image.src = layer.url;
  }

  function toggleLayerLocked(layer: Layer) {
    recordHistory();
    if (layer.type === "text") setTextLayers((items) => items.map((item) => item.id === layer.id ? { ...item, locked: !item.locked } : item));
    else if (layer.type === "image") setImageLayers((items) => items.map((item) => item.id === layer.id ? { ...item, locked: !item.locked } : item));
    else setShapeLayers((items) => items.map((item) => item.id === layer.id ? { ...item, locked: !item.locked } : item));
  }

  function toggleLayerVisible(layer: Layer) {
    recordHistory();
    if (layer.type === "text") setTextLayers((items) => items.map((item) => item.id === layer.id ? { ...item, visible: item.visible === false } : item));
    else if (layer.type === "image") setImageLayers((items) => items.map((item) => item.id === layer.id ? { ...item, visible: item.visible === false } : item));
    else setShapeLayers((items) => items.map((item) => item.id === layer.id ? { ...item, visible: item.visible === false } : item));
  }

  function updateSelectedLayer(updates: Partial<LayerState>) {
    if (selectedText) updateText(updates);
    else if (selectedImg) updateImage(updates);
    else if (selectedShape) updateShape(updates);
  }

  // ── Templates ─────────────────────────────────────────────────
  async function saveTemplate() {
    const name = prompt("Enter a name for this template:");
    if (!name) return;
    let preview_image_url: string | null = null;
    preview_image_url = await captureCanvasImage("jpg", 0.5, 0.5);
    const layout_json = { preset, customSize, useCustomSize, bgImage, bgType, bgColor, bgGradient, filters, textLayers, imageLayers, shapeLayers, snapToGrid, gridSize };
    try {
      const res = await fetch("/api/admin/marketing-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_name: name, layout_json, preview_image_url }),
      });
      if (res.ok) { alert("Template saved!"); fetchTemplates(); }
      else alert("Failed to save template.");
    } catch { alert("Error saving template."); }
  }

  function loadTemplate(t: Template) {
    if (!confirm("Load this template? Current design will be lost.")) return;
    recordHistory();
    const normalized = normalizeMarketingTemplate(t.layout_json);
    setPreset(normalized.preset);
    setCustomSize(normalized.customSize);
    setUseCustomSize(normalized.useCustomSize);
    setBgImage(normalized.bgImage);
    setBgType(normalized.bgType);
    setBgColor(normalized.bgColor);
    setBgGradient(normalized.bgGradient);
    setFilters(normalized.filters);
    setTextLayers(normalized.textLayers);
    setImageLayers(normalized.imageLayers);
    setShapeLayers(normalized.shapeLayers);
    setSnapToGrid(normalized.snapToGrid);
    setGridSize(normalized.gridSize);
    fitMode.current = true;
    setSelectedLayerId(null);
    setShowTemplates(false);
  }

  async function deleteTemplate(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this template?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/marketing-templates/${id}`, { method: "DELETE" });
      if (res.ok) setTemplates((prev) => prev.filter((t) => t.id !== id));
      else alert("Failed to delete template.");
    } catch { alert("Error deleting template."); }
    finally { setDeletingId(null); }
  }

  // ── Derived ───────────────────────────────────────────────────
  const allLayers: Layer[] = [...textLayers, ...imageLayers, ...shapeLayers].sort((a, b) => a.zIndex - b.zIndex);
  const selectedText = selectedLayerType === "text" ? textLayers.find((l) => l.id === selectedLayerId) : undefined;
  const selectedImg = selectedLayerType === "image" ? imageLayers.find((l) => l.id === selectedLayerId) : undefined;
  const selectedShape = selectedLayerType === "shape" ? shapeLayers.find((l) => l.id === selectedLayerId) : undefined;
  const canUndoHistory = historyRevision >= 0 && historyRef.current.canUndo;
  const canRedoHistory = historyRevision >= 0 && historyRef.current.canRedo;
  const currentModel = MODELS[aiModel as keyof typeof MODELS];
  const currentUsage = usageTracker[aiModel] || 0;
  const imageModelEntries = Object.entries(MODELS).filter(([, v]) => v.kind === "image");
  const textModelEntries = Object.entries(MODELS).filter(([, v]) => v.kind === "text");

  return (
    <div className="space-y-6">
    <div><h1>Design Studio</h1><p className="mt-2 text-on-surface-variant">Create, edit and export marketing artwork.</p></div>
    <div className="flex flex-col xl:flex-row h-full gap-6 relative">

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <div className="w-full xl:w-80 shrink-0 flex flex-col gap-4">

        {/* Top buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => { setShowTemplates(true); fetchTemplates(); }}
            className="flex-1 bg-surface-container-high hover:bg-surface-variant text-on-surface text-sm font-bold py-2 rounded-xl flex items-center justify-center gap-2 border border-outline-variant shadow-sm transition-all"
          >
            <FolderOpen size={16} /> Templates
          </button>
          <button
            onClick={saveTemplate}
            className="flex-1 bg-surface-container-high hover:bg-surface-variant text-on-surface text-sm font-bold py-2 rounded-xl flex items-center justify-center gap-2 border border-outline-variant shadow-sm transition-all"
          >
            <Save size={16} /> Save
          </button>
        </div>

        {/* Templates overlay */}
        {showTemplates && (
          <div className="absolute inset-0 z-50 bg-background/90 backdrop-blur-md p-6 overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black">Your Templates</h2>
              <button onClick={() => setShowTemplates(false)} className="px-4 py-2 bg-surface rounded-lg border border-outline-variant">
                Close
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {templates.map((t) => (
                <div
                  key={t.id}
                  onClick={() => loadTemplate(t)}
                  className="relative cursor-pointer bg-surface border border-outline-variant rounded-xl overflow-hidden hover:border-primary transition-colors"
                >
                  <button
                    onClick={(e) => deleteTemplate(t.id, e)}
                    disabled={deletingId === t.id}
                    className="absolute top-2 right-2 z-10 bg-red-600/90 hover:bg-red-600 text-white rounded-md px-1.5 py-1 cursor-pointer flex items-center"
                    title="Delete template"
                  >
                    {deletingId === t.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                  <div className="h-40 bg-surface-container-highest">
                    {t.preview_image_url && (
                      <img src={t.preview_image_url} alt="Preview" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="p-3 text-sm font-bold text-center">{t.template_name}</div>
                </div>
              ))}
              {templates.length === 0 && (
                <p className="col-span-full text-center text-on-surface-variant py-8">No templates saved yet.</p>
              )}
            </div>
          </div>
        )}

        {/* Dimensions */}
        <div className="bg-surface-container/50 backdrop-blur-md rounded-2xl p-4 border border-outline-variant shadow-sm">
          <h3 className="font-bold mb-3 text-sm">Dimensions</h3>
          <div className="space-y-3 text-sm">
            <select
              aria-label="Canvas dimensions"
              className="w-full bg-surface p-2.5 rounded-xl border border-outline/50 shadow-inner"
              value={useCustomSize ? "custom" : preset}
              onChange={(e) => {
                recordHistory();
                if (e.target.value === "custom") { fitMode.current = true; setUseCustomSize(true); }
                else { fitMode.current = true; setUseCustomSize(false); setPreset(e.target.value as keyof typeof PRESETS); }
              }}
            >
              {Object.entries(PRESETS).map(([k, v]) => (
                <option key={k} value={k}>{v.label} ({v.width}×{v.height})</option>
              ))}
              <option value="custom">Custom...</option>
            </select>
            {useCustomSize && (
              <div className="flex gap-2">
                <input aria-label="Custom canvas width" type="number" min={1} max={4000} value={customSize.width} onFocus={beginControlHistory} onBlur={endControlHistory} onChange={(e) => { recordHistory(); fitMode.current = true; setCustomSize({ ...customSize, width: Math.max(1, Math.min(4000, Number(e.target.value) || 1)) }); }} className="w-full bg-surface p-2.5 rounded-xl border border-outline/50 shadow-inner" placeholder="Width" />
                <input aria-label="Custom canvas height" type="number" min={1} max={4000} value={customSize.height} onFocus={beginControlHistory} onBlur={endControlHistory} onChange={(e) => { recordHistory(); fitMode.current = true; setCustomSize({ ...customSize, height: Math.max(1, Math.min(4000, Number(e.target.value) || 1)) }); }} className="w-full bg-surface p-2.5 rounded-xl border border-outline/50 shadow-inner" placeholder="Height" />
              </div>
            )}
          </div>
        </div>

        {/* AI Studio */}
        <div className="bg-surface-container/50 backdrop-blur-md rounded-2xl p-4 border border-outline-variant shadow-sm">
          <h3 className="font-bold mb-3 text-sm flex items-center gap-2"><Wand2 size={16} /> AI Studio</h3>
          <div className="space-y-3 text-sm">
            {/* Mode toggle */}
            <div className="flex bg-surface-variant/50 rounded-xl p-1 border border-outline/30">
              <button
                onClick={() => { setAiType("image"); setAiModel("imagen-3.0-generate-001"); setAiSlogans([]); }}
                className={`flex-1 py-1.5 text-center rounded-lg transition-all font-medium text-sm ${aiType === "image" ? "bg-primary text-on-primary shadow" : "text-on-surface-variant hover:text-on-surface"}`}
              >Images</button>
              <button
                onClick={() => { setAiType("text"); setAiModel("gemini-2.5-flash"); setAiSlogans([]); }}
                className={`flex-1 py-1.5 text-center rounded-lg transition-all font-medium text-sm ${aiType === "text" ? "bg-primary text-on-primary shadow" : "text-on-surface-variant hover:text-on-surface"}`}
              >Slogans</button>
            </div>

            <select
              className="w-full bg-surface p-2.5 rounded-xl border border-outline/50 shadow-inner text-xs"
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
            >
              {(aiType === "image" ? imageModelEntries : textModelEntries).map(([k, v]) => (
                <option key={k} value={k}>{v.name}</option>
              ))}
            </select>

            {/* Quota bar */}
            {currentModel && (
              <div className="bg-surface-container-high rounded-xl p-3 text-xs border border-outline/30">
                <div className="flex justify-between font-bold mb-1.5">
                  <span>Daily Quota</span>
                  <span className={currentUsage >= currentModel.dailyLimit ? "text-red-500" : ""}>{currentUsage} / {currentModel.dailyLimit}</span>
                </div>
                <div className="w-full bg-surface-variant rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all ${currentUsage >= currentModel.dailyLimit ? "bg-red-500" : "bg-primary"}`}
                    style={{ width: `${Math.min(100, (currentUsage / currentModel.dailyLimit) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            <textarea
              className="w-full bg-surface p-3 rounded-xl border border-outline/50 resize-none shadow-inner text-sm"
              rows={3}
              placeholder={aiType === "image" ? "Describe the poster background..." : "Describe slogans for your poster..."}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
            />
            <button
              onClick={handleGenerateAI}
              disabled={isGenerating || !aiPrompt}
              className="w-full bg-gradient-to-r from-primary to-secondary text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 shadow-md hover:shadow-lg transition-all"
            >
              {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              Generate {aiType === "image" ? "Image" : "Slogan"}
            </button>

            {/* Clickable slogan results */}
            {aiSlogans.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-on-surface-variant font-bold uppercase">Click to add to canvas:</p>
                {aiSlogans.map((line, i) => (
                  <button
                    key={i}
                    onClick={() => addTextFromAI(line)}
                    className="w-full text-left text-xs p-2 bg-surface border border-outline/50 rounded-lg hover:border-primary hover:bg-surface-variant transition-all"
                  >
                    ✨ {line}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Backgrounds */}
        <div className="bg-surface-container/50 backdrop-blur-md rounded-2xl p-4 border border-outline-variant shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-sm flex items-center gap-2"><ImageIcon size={16} /> Backgrounds</h3>
            <label className="cursor-pointer text-primary text-xs font-bold bg-primary/10 px-3 py-1.5 rounded-lg hover:bg-primary/20 flex items-center gap-1 transition-colors">
              <Upload size={12} /> Upload
              <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
            </label>
          </div>

          {bgImages.length === 0 ? (
            <p className="text-xs text-on-surface-variant text-center py-4 border border-dashed border-outline rounded-lg">
              Upload or generate an image to begin.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-52 overflow-y-auto mb-3 p-1">
              {/* Clear background */}
              <div
                onClick={() => { if (bgImage !== null || bgType !== "image") { recordHistory(); setBgImage(null); setBgType("image"); } }}
                className={`cursor-pointer rounded-lg border-2 aspect-square flex flex-col items-center justify-center text-xs text-on-surface-variant transition-colors ${!bgImage ? "border-primary bg-primary/5" : "border-dashed border-outline hover:border-primary/50"}`}
              >
                <span className="text-xl mb-1">🚫</span>Clear
              </div>
              {bgImages.map((img) => (
                <div key={img.url} className="relative group">
                  <div
                    onClick={() => { if (bgImage !== img.url || bgType !== "image") { recordHistory(); setBgImage(img.url); setBgType("image"); } }}
                    className={`cursor-pointer rounded-lg overflow-hidden border-2 aspect-square ${bgImage === img.url ? "border-primary shadow-md" : "border-transparent hover:border-primary/50"}`}
                  >
                    <img src={img.url} alt="BG" className="w-full h-full object-cover" />
                  </div>
                  <button
                    title="Add as image layer"
                    onClick={(e) => { e.stopPropagation(); addImageLayer(img.url); }}
                    className="absolute top-1 right-1 bg-primary text-white rounded px-1 py-0.5 text-[10px] cursor-pointer z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center"
                  >
                    <Plus size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="space-y-2 border-t border-outline/30 pt-3">
            <h4 className="text-xs font-bold text-on-surface-variant flex items-center gap-1">
              <SlidersHorizontal size={12} /> Filters
            </h4>
            {(
              [
                { label: "Bright", key: "brightness", min: 0, max: 200 },
                { label: "Contrast", key: "contrast", min: 0, max: 200 },
                { label: "B&W", key: "grayscale", min: 0, max: 100 },
              ] as const
            ).map(({ label, key, min, max }) => (
              <div key={key} className="text-xs flex items-center gap-2">
                <span className="w-14">{label}</span>
                <input
                  type="range" min={min} max={max}
                  aria-label={label}
                  value={filters[key as keyof typeof filters]}
                  onChange={(e) => { recordHistory(); setFilters({ ...filters, [key]: Number(e.target.value) }); }}
                  className="flex-1 accent-primary"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface-container/50 backdrop-blur-md rounded-2xl p-4 border border-outline-variant shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm flex items-center gap-2"><Layers size={16} /> Layers</h3>
            <span className="text-xs text-on-surface-variant">{allLayers.length}</span>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {[...allLayers].reverse().map((layer) => (
              <div key={`${layer.type}-${layer.id}`} className={`flex items-center gap-1 rounded-lg border px-1.5 py-1 ${selectedLayerId === layer.id ? "border-primary bg-primary/5" : "border-transparent hover:border-outline-variant"}`}>
                <button
                  onClick={() => { setSelectedLayerId(layer.id); setSelectedLayerType(layer.type); }}
                  className="min-w-0 min-h-10 flex-1 text-left text-xs truncate px-2"
                  aria-label={`Select ${layer.type} layer`}
                >
                  {layer.type === "text" ? `Text: ${layer.text || "(empty)"}` : layer.type === "image" ? "Image layer" : `${layer.shapeType} shape`}
                  {layer.locked ? " · locked" : ""}
                  {layer.visible === false ? " · hidden" : ""}
                </button>
                <button
                  onClick={() => toggleLayerLocked(layer)}
                  className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-md hover:bg-surface-variant"
                  title={layer.locked ? "Unlock layer" : "Lock layer"}
                  aria-label={layer.locked ? "Unlock layer" : "Lock layer"}
                >{layer.locked ? <Lock size={15} /> : <Unlock size={15} />}</button>
                <button
                  onClick={() => toggleLayerVisible(layer)}
                  className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-md hover:bg-surface-variant"
                  title={layer.visible === false ? "Show layer" : "Hide layer"}
                  aria-label={layer.visible === false ? "Show layer" : "Hide layer"}
                >{layer.visible === false ? <EyeOff size={15} /> : <Eye size={15} />}</button>
              </div>
            ))}
            {allLayers.length === 0 && <p className="py-3 text-center text-xs text-on-surface-variant">No layers added yet.</p>}
          </div>
        </div>
      </div>

      {/* ── Canvas Area ─────────────────────────────────────────── */}
      <div
        className="min-w-0 w-full flex-1 bg-surface-variant rounded-xl border border-outline-variant flex flex-col items-center p-4 relative gap-4"
        onClick={() => setSelectedLayerId(null)}
      >
        {/* Top action bar */}
        <div className="w-full flex flex-wrap items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={undo} disabled={!canUndoHistory} aria-label="Undo" title="Undo (Ctrl/Cmd+Z)" className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-outline/30 bg-surface disabled:opacity-40"><Undo2 size={17} /></button>
            <button onClick={redo} disabled={!canRedoHistory} aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)" className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-outline/30 bg-surface disabled:opacity-40"><Redo2 size={17} /></button>
            <button onClick={() => setGridVisible((visible) => !visible)} aria-pressed={gridVisible} aria-label="Toggle grid" title="Toggle grid" className={`min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-outline/30 ${gridVisible ? "bg-primary text-on-primary" : "bg-surface"}`}><Grid2X2 size={17} /></button>
            <button onClick={() => { recordHistory(); setSnapToGrid((enabled) => !enabled); }} aria-pressed={snapToGrid} aria-label="Toggle grid snapping" title="Snap to grid" className={`min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-outline/30 ${snapToGrid ? "bg-primary text-on-primary" : "bg-surface"}`}><Magnet size={17} /></button>
            <div className="flex items-center gap-1 rounded-xl border border-outline/30 bg-surface px-1">
              <button onClick={() => { fitMode.current = false; setZoom((value) => Math.max(0.1, Math.round((value - 0.1) * 100) / 100)); }} aria-label="Zoom out" className="min-h-11 min-w-10 inline-flex items-center justify-center"><ZoomOut size={16} /></button>
              <span className="min-w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
              <button onClick={() => { fitMode.current = false; setZoom((value) => Math.min(4, Math.round((value + 0.1) * 100) / 100)); }} aria-label="Zoom in" className="min-h-11 min-w-10 inline-flex items-center justify-center"><ZoomIn size={16} /></button>
              <button onClick={() => { fitMode.current = true; const viewport = viewportRef.current; if (viewport) setZoom(fitCanvasZoom(viewport.clientWidth, viewport.clientHeight, canvasWidth, canvasHeight)); }} className="min-h-11 px-2 text-xs font-semibold">Fit</button>
            </div>
            <select aria-label="Add shape" defaultValue="" onChange={(event) => { const value = event.target.value; if (value) addShapeLayer(value as ShapeLayer["shapeType"]); event.currentTarget.value = ""; }} className="min-h-11 rounded-xl border border-outline/30 bg-surface px-3 text-sm">
              <option value="">Add shape…</option><option value="rect">Rectangle</option><option value="circle">Circle</option><option value="line">Line</option>
            </select>
            <button onClick={copyPoster} className="min-h-11 rounded-xl border border-outline/30 bg-surface px-3 text-sm font-semibold">Copy</button>
            <button onClick={() => { setShareUrl(null); setShareError(""); setShowShareDialog(true); }} className="min-h-11 rounded-xl border border-outline/30 bg-surface px-3 text-sm font-semibold inline-flex items-center gap-2"><Share2 size={16} /> Share</button>
          </div>
          <button
            onClick={() => addTextLayer()}
            className="min-h-11 bg-white/90 dark:bg-black/90 backdrop-blur text-primary text-sm font-bold px-4 py-2 rounded-xl shadow-lg border border-outline/30 hover:bg-primary hover:text-white transition-all flex items-center gap-2"
          >
            <Type size={16} /> Add Text
          </button>
          <div className="flex items-center gap-2 bg-white/90 dark:bg-black/90 backdrop-blur px-3 py-1 rounded-xl shadow-lg border border-outline/30">
            <select
              className="bg-transparent text-sm font-bold outline-none cursor-pointer"
              value={quality}
              onChange={(e) => setQuality(e.target.value as keyof typeof QUALITIES)}
            >
              {Object.entries(QUALITIES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select aria-label="Export format" value={exportFormat} onChange={(event) => setExportFormat(event.target.value as "jpg" | "png")} className="min-h-11 rounded-lg bg-transparent text-sm font-semibold">
              <option value="jpg">JPEG</option><option value="png">PNG</option>
            </select>
            <button onClick={exportPoster} aria-label="Export poster" className="min-h-11 min-w-11 inline-flex items-center justify-center bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors">
              <Download size={16} />
            </button>
          </div>
        </div>

        {/* Floating toolbar */}
        {(selectedText || selectedImg || selectedShape) && (
          <div
            className="w-full bg-surface p-3 rounded-xl border border-outline-variant flex flex-wrap items-start gap-3"
            onClick={(e) => e.stopPropagation()}
            onFocusCapture={(event) => {
              if ((event.target as HTMLElement).matches("input, textarea, select, [role='textbox']")) beginControlHistory();
            }}
            onBlurCapture={(event) => {
              if ((event.target as HTMLElement).matches("input, textarea, select, [role='textbox']")) endControlHistory();
            }}
          >
            {/* TEXT controls */}
            {selectedText && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-on-surface-variant">Text</label>
                  <textarea
                    value={selectedText.text}
                    onChange={(e) => updateText({ text: e.target.value })}
                    className="bg-surface-container rounded-lg p-1.5 text-sm outline-none resize-none w-32"
                    rows={2}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-on-surface-variant">Font</label>
                  <select
                    value={selectedText.fontFamily}
                    onChange={(e) => updateText({ fontFamily: e.target.value })}
                    className="bg-surface-container rounded-lg p-1 text-sm outline-none w-32"
                  >
                    {FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-on-surface-variant">Weight</label>
                  <select
                    value={selectedText.fontWeight}
                    onChange={(e) => updateText({ fontWeight: e.target.value })}
                    className="bg-surface-container rounded-lg p-1 text-sm outline-none w-20"
                  >
                    <option value="400">Normal</option>
                    <option value="700">Bold</option>
                    <option value="900">Black</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-on-surface-variant">Size</label>
                  <input
                    type="number"
                    value={selectedText.fontSize}
                    onChange={(e) => updateText({ fontSize: Number(e.target.value) })}
                    className="w-16 bg-surface-container px-2 py-1 rounded-lg text-sm outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1 border-l border-outline/30 pl-3">
                  <label className="text-[10px] uppercase font-bold text-on-surface-variant">Color</label>
                  <input
                    type="color"
                    value={selectedText.color}
                    onChange={(e) => updateText({ color: e.target.value, gradient: "" })}
                    className="w-8 h-8 rounded-full border-2 border-outline/50 cursor-pointer p-0 overflow-hidden"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-on-surface-variant">Gradient</label>
                  <select
                    value={selectedText.gradient}
                    onChange={(e) => updateText({ gradient: e.target.value })}
                    className="bg-surface-container rounded-lg p-1 text-sm outline-none w-24"
                  >
                    {GRADIENTS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-on-surface-variant">Align</label>
                  <div className="flex bg-surface-container rounded-lg p-1 gap-1">
                    <button onClick={() => updateText({ textAlign: "left" })} className={`p-1.5 rounded-md ${selectedText.textAlign === "left" ? "bg-surface shadow" : ""}`}><AlignLeft size={14} /></button>
                    <button onClick={() => updateText({ textAlign: "center" })} className={`p-1.5 rounded-md ${selectedText.textAlign === "center" ? "bg-surface shadow" : ""}`}><AlignCenter size={14} /></button>
                    <button onClick={() => updateText({ textAlign: "right" })} className={`p-1.5 rounded-md ${selectedText.textAlign === "right" ? "bg-surface shadow" : ""}`}><AlignRight size={14} /></button>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-on-surface-variant">Style</label>
                  <label className="flex items-center gap-1 text-xs cursor-pointer bg-surface-container px-2 py-1.5 rounded-lg hover:bg-surface-variant">
                    <input type="checkbox" checked={selectedText.shadow} onChange={(e) => updateText({ shadow: e.target.checked })} /> Shadow
                  </label>
                  <label className="flex items-center gap-1 text-xs cursor-pointer bg-surface-container px-2 py-1.5 rounded-lg hover:bg-surface-variant">
                    <input type="checkbox" checked={selectedText.stroke} onChange={(e) => updateText({ stroke: e.target.checked })} /> Stroke
                  </label>
                </div>
              </>
            )}

            {/* IMAGE controls */}
            {selectedImg && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-on-surface-variant">Width ({selectedImg.width}px)</label>
                  <input type="range" min={50} max={1500} value={selectedImg.width} onChange={(e) => updateImage({ width: Number(e.target.value) })} className="w-40 accent-primary" />
                </div>
                <div className="flex flex-col gap-1 border-l border-outline/30 pl-3">
                  <label className="text-[10px] uppercase font-bold text-on-surface-variant">Background erase</label>
                  <div className="flex items-center gap-2">
                    <input type="color" aria-label="Color to remove" value={chromaColor} onChange={(e) => setChromaColor(e.target.value)} className="w-10 h-10 rounded border border-outline/50" />
                    <button onClick={pickChromaColor} className="min-h-11 rounded-lg border border-outline/30 px-3 text-xs">Pick</button>
                    <button onClick={eraseImageBackground} className="min-h-11 rounded-lg bg-primary px-3 text-xs font-semibold text-on-primary">Remove</button>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-on-surface-variant">Tolerance {chromaTolerance}%
                    <input type="range" min={1} max={100} value={chromaTolerance} onChange={(e) => setChromaTolerance(Number(e.target.value))} className="w-24 accent-primary" />
                  </label>
                </div>
              </>
            )}

            {selectedShape && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-on-surface-variant">Shape</label>
                  <span className="text-xs font-semibold capitalize">{selectedShape.shapeType}</span>
                </div>
                <label className="flex flex-col gap-1 text-[10px] uppercase font-bold text-on-surface-variant">Width
                  <input type="number" min={1} max={4000} value={selectedShape.width} onChange={(e) => updateShape({ width: Math.max(1, Number(e.target.value)) })} className="w-20 rounded-lg bg-surface-container px-2 py-1 text-sm font-normal" />
                </label>
                {selectedShape.shapeType !== "line" && <label className="flex flex-col gap-1 text-[10px] uppercase font-bold text-on-surface-variant">Height
                  <input type="number" min={1} max={4000} value={selectedShape.height} onChange={(e) => updateShape({ height: Math.max(1, Number(e.target.value)) })} className="w-20 rounded-lg bg-surface-container px-2 py-1 text-sm font-normal" />
                </label>}
                <label className="flex flex-col gap-1 text-[10px] uppercase font-bold text-on-surface-variant">Fill
                  <input type="color" value={selectedShape.fillColor} onChange={(e) => updateShape({ fillColor: e.target.value })} className="h-10 w-10 rounded border border-outline/50" />
                </label>
                <label className="flex flex-col gap-1 text-[10px] uppercase font-bold text-on-surface-variant">Stroke
                  <input type="color" value={selectedShape.strokeColor} onChange={(e) => updateShape({ strokeColor: e.target.value })} className="h-10 w-10 rounded border border-outline/50" />
                </label>
                <label className="flex flex-col gap-1 text-[10px] uppercase font-bold text-on-surface-variant">Stroke px
                  <input type="number" min={0} max={100} value={selectedShape.strokeWidth} onChange={(e) => updateShape({ strokeWidth: Math.max(0, Number(e.target.value)) })} className="w-20 rounded-lg bg-surface-container px-2 py-1 text-sm font-normal" />
                </label>
              </>
            )}

            <div className="flex flex-col gap-1 border-l border-outline/30 pl-3">
              <label className="text-[10px] uppercase font-bold text-on-surface-variant">Transform</label>
              <label className="flex items-center gap-2 text-xs">Opacity {Math.round((selectedText?.opacity ?? selectedImg?.opacity ?? selectedShape?.opacity ?? 1) * 100)}%
                <input type="range" min={0} max={100} value={Math.round((selectedText?.opacity ?? selectedImg?.opacity ?? selectedShape?.opacity ?? 1) * 100)} onChange={(e) => updateSelectedLayer({ opacity: Number(e.target.value) / 100 })} className="w-24 accent-primary" />
              </label>
              <label className="flex items-center gap-2 text-xs">Rotation {selectedText?.rotation ?? selectedImg?.rotation ?? selectedShape?.rotation ?? 0}°
                <input type="range" min={-180} max={180} value={selectedText?.rotation ?? selectedImg?.rotation ?? selectedShape?.rotation ?? 0} onChange={(e) => updateSelectedLayer({ rotation: Number(e.target.value) })} className="w-24 accent-primary" />
              </label>
              <div className="flex gap-1">
                <button onClick={() => selectedText ? updateText({ locked: !selectedText.locked }) : selectedImg ? updateImage({ locked: !selectedImg.locked }) : updateShape({ locked: !selectedShape?.locked })} aria-label={(selectedText?.locked || selectedImg?.locked || selectedShape?.locked) ? "Unlock selected layer" : "Lock selected layer"} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-md bg-surface-container">
                  {(selectedText?.locked || selectedImg?.locked || selectedShape?.locked) ? <Lock size={15} /> : <Unlock size={15} />}
                </button>
                <button onClick={() => selectedText ? updateText({ visible: selectedText.visible === false }) : selectedImg ? updateImage({ visible: selectedImg.visible === false }) : updateShape({ visible: selectedShape?.visible === false })} aria-label="Toggle selected layer visibility" className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-md bg-surface-container">
                  {(selectedText?.visible === false || selectedImg?.visible === false || selectedShape?.visible === false) ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Shared layer controls */}
            <div className="flex flex-col gap-1 border-l border-outline/30 pl-3">
              <label className="text-[10px] uppercase font-bold text-on-surface-variant">Layer</label>
              <div className="flex gap-1 flex-wrap">
                <button onClick={() => moveLayer(1)} title="Bring Forward" aria-label="Bring layer forward" className="min-h-11 min-w-11 inline-flex items-center justify-center bg-surface-container hover:bg-surface-variant rounded-md text-xs font-medium">
                  <Layers size={14} />
                </button>
                <button onClick={() => moveLayer(-1)} title="Send Backward" aria-label="Send layer backward" className="min-h-11 min-w-11 inline-flex items-center justify-center bg-surface-container hover:bg-surface-variant rounded-md text-xs font-medium opacity-70">
                  <Layers size={14} />
                </button>
                <button onClick={duplicateLayer} title="Duplicate" aria-label="Duplicate layer" className="min-h-11 min-w-11 inline-flex items-center justify-center bg-surface-container hover:bg-surface-variant rounded-md">
                  <Copy size={14} />
                </button>
                <button onClick={deleteLayer} aria-label="Delete layer" className="min-h-11 min-w-11 inline-flex items-center justify-center text-red-500 hover:bg-red-500/10 rounded-md transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Canvas wrapper */}
        <div
          ref={viewportRef}
          className="admin-design-preview-scroll min-h-[420px] max-h-[70vh] w-full flex-1 rounded-xl bg-background/40 p-4"
        >
          <div className="relative mx-auto" style={{ width: canvasWidth * zoom, height: canvasHeight * zoom }}>
            <div
              data-admin-artwork
              className="relative bg-white shadow-2xl flex-shrink-0 ring-1 ring-outline/20"
              style={{ width: canvasWidth, height: canvasHeight, transform: `scale(${zoom})`, transformOrigin: "top left" }}
              onClick={(e) => {
                e.stopPropagation();
                if ((e.target as HTMLElement).closest("[data-layer-id]")) return;
                setSelectedLayerId(null);
              }}
            >
              <div
                ref={canvasRef}
                className="absolute inset-0 overflow-hidden bg-white"
                style={{
                  width: canvasWidth,
                  height: canvasHeight,
                  background: bgType === "gradient" ? bgGradient : bgType === "color" ? bgColor : "#ffffff",
                }}
              >
              {bgImage && (
                <img
                  src={bgImage}
                  alt="Background"
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{
                    filter: `brightness(${filters.brightness}%) contrast(${filters.contrast}%) grayscale(${filters.grayscale}%) blur(${filters.blur}px)`,
                    objectFit: filters.bgFit,
                    objectPosition: `${filters.bgPosX}% ${filters.bgPosY}%`,
                    transform: `scale(${filters.bgScale / 100})`,
                  }}
                />
              )}

              {allLayers.map((layer) => {
                const isSelected = layer.id === selectedLayerId;
                if (layer.type === "text") {
                  const t = layer as TextLayer;
                  return (
                    <div
                      key={t.id}
                      data-layer-id={t.id}
                      data-layer-type="text"
                      onPointerDown={(e) => handlePointerDown(e, t.id, "text")}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                      className={`absolute px-2 py-1 whitespace-pre-wrap select-none touch-none ${t.locked ? "cursor-not-allowed" : "cursor-move"} ${isSelected ? "outline-2 outline-dashed outline-primary ring-4 ring-primary/20" : ""}`}
                      style={{
                        left: t.x,
                        top: t.y,
                        zIndex: t.zIndex,
                        opacity: t.opacity ?? 1,
                        transform: `rotate(${t.rotation ?? 0}deg)`,
                        transformOrigin: "center center",
                        display: t.visible === false ? "none" : undefined,
                        fontSize: `${t.fontSize}px`,
                        fontFamily: t.fontFamily,
                        fontWeight: t.fontWeight,
                        textAlign: t.textAlign,
                        lineHeight: 1.2,
                        textShadow: t.shadow ? "0px 4px 12px rgba(0,0,0,0.8)" : "none",
                        WebkitTextStroke: t.stroke ? `2px ${t.strokeColor}` : "none",
                        ...(t.gradient
                          ? { background: t.gradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }
                          : { color: t.color }),
                      }}
                    >
                      {t.text}
                    </div>
                  );
                } else if (layer.type === "image") {
                  const img = layer;
                  return (
                    <img
                      key={img.id}
                      data-layer-id={img.id}
                      data-layer-type="image"
                      src={img.url}
                      alt="Layer"
                      draggable={false}
                      onPointerDown={(e) => handlePointerDown(e, img.id, "image")}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                      className={`absolute select-none touch-none ${img.locked ? "cursor-not-allowed" : "cursor-move"} ${isSelected ? "outline-2 outline-dashed outline-primary ring-4 ring-primary/20" : ""}`}
                      style={{
                        left: img.x,
                        top: img.y,
                        zIndex: img.zIndex,
                        width: img.width,
                        opacity: img.opacity ?? 1,
                        transform: `rotate(${img.rotation ?? 0}deg)`,
                        transformOrigin: "center center",
                        display: img.visible === false ? "none" : undefined,
                        borderColor: img.borderColor,
                        borderWidth: img.borderWidth,
                        borderStyle: img.borderStyle,
                        borderRadius: img.borderRadius,
                      }}
                    />
                  );
                } else {
                  const shape = layer;
                  return (
                    <div
                      key={shape.id}
                      data-layer-id={shape.id}
                      data-layer-type="shape"
                      onPointerDown={(e) => handlePointerDown(e, shape.id, "shape")}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                      className={`absolute select-none touch-none ${shape.locked ? "cursor-not-allowed" : "cursor-move"} ${isSelected ? "outline-2 outline-dashed outline-primary ring-4 ring-primary/20" : ""}`}
                      style={{
                        left: shape.x,
                        top: shape.y,
                        zIndex: shape.zIndex,
                        width: shape.width,
                        height: shape.shapeType === "line" ? shape.strokeWidth || 4 : shape.height,
                        opacity: shape.opacity ?? 1,
                        transform: `rotate(${shape.rotation ?? 0}deg)`,
                        transformOrigin: "center center",
                        display: shape.visible === false ? "none" : undefined,
                        backgroundColor: shape.shapeType === "line" ? shape.fillColor || shape.strokeColor || "#000000" : shape.fillColor,
                        border: shape.shapeType === "line" || shape.strokeWidth === 0 ? "none" : `${shape.strokeWidth}px solid ${shape.strokeColor}`,
                        borderRadius: shape.shapeType === "circle" ? "50%" : shape.shapeType === "rect" ? shape.borderRadius : 0,
                      }}
                    />
                  );
                }
              })}
                {gridVisible && <div data-editor-grid aria-hidden="true" className="absolute inset-0 z-[9999] pointer-events-none" style={{ backgroundImage: "linear-gradient(to right, rgb(0 0 0 / 18%) 1px, transparent 1px), linear-gradient(to bottom, rgb(0 0 0 / 18%) 1px, transparent 1px)", backgroundSize: `${gridSize}px ${gridSize}px` }} />}
              </div>
            </div>
          </div>
        </div>

        <dialog
          ref={shareDialogRef}
          onCancel={(event) => { event.preventDefault(); setShowShareDialog(false); }}
          onClose={() => setShowShareDialog(false)}
          onClick={(event) => { if (event.target === event.currentTarget) setShowShareDialog(false); }}
          className="m-auto w-[min(92vw,34rem)] rounded-2xl border border-outline-variant bg-surface p-0 text-on-surface shadow-2xl backdrop:bg-black/60"
        >
          <div className="p-5 sm:p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="text-lg font-bold">Share this poster</h2><p className="mt-1 text-sm text-on-surface-variant">Create a public image link for this design.</p></div>
              <button onClick={() => setShowShareDialog(false)} aria-label="Close share dialog" className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg hover:bg-surface-variant"><X size={18} /></button>
            </div>
            <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-on-surface">
              Anyone with the link can view this image. Do not share customer details, contact information, or other private content.
            </p>
            {!shareUrl ? (
              <>
                {shareError && <p role="alert" className="mt-3 text-sm text-red-600">{shareError}</p>}
                <button onClick={createShareLink} disabled={isSharing} className="mt-4 min-h-11 w-full rounded-xl bg-primary px-4 font-semibold text-on-primary disabled:opacity-60">
                  {isSharing ? "Creating link…" : "Create public link"}
                </button>
              </>
            ) : (
              <>
                <label className="mt-4 block text-xs font-bold uppercase text-on-surface-variant" htmlFor="marketing-share-url">Public image link</label>
                <div className="mt-1 flex gap-2">
                  <input id="marketing-share-url" readOnly value={shareUrl} className="min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm" onFocus={(event) => event.currentTarget.select()} />
                  <button onClick={copyShareLink} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary">Copy</button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`Check out this design I created: ${shareUrl}`)}`, "_blank", "noopener,noreferrer")} className="min-h-11 rounded-lg border border-outline-variant px-3 text-sm">WhatsApp</button>
                  <button onClick={() => window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent("Check out this design!")}`, "_blank", "noopener,noreferrer")} className="min-h-11 rounded-lg border border-outline-variant px-3 text-sm">Telegram</button>
                </div>
                {shareError && <p role="alert" className="mt-3 text-sm text-red-600">{shareError}</p>}
              </>
            )}
          </div>
        </dialog>
        {notice && <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-[100] max-w-[min(90vw,28rem)] rounded-xl bg-surface px-4 py-3 text-sm shadow-xl ring-1 ring-outline-variant">{notice}</div>}
      </div>
    </div>
    </div>
  );
}

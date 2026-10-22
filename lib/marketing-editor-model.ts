export type EditorHistoryState = Record<string, unknown>;

export type MarketingEditorFilters = {
  brightness: number;
  contrast: number;
  grayscale: number;
  blur: number;
  bgFit: "cover" | "contain" | "fill" | "none" | "scale-down";
  bgScale: number;
  bgPosX: number;
  bgPosY: number;
};

type MarketingLayerState = {
  opacity?: number;
  rotation?: number;
  locked?: boolean;
  visible?: boolean;
};

export type MarketingTextLayer = MarketingLayerState & {
  id: string;
  type: "text";
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  gradient: string;
  fontFamily: string;
  fontWeight: string;
  textAlign: "left" | "center" | "right";
  shadow: boolean;
  stroke: boolean;
  strokeColor: string;
  zIndex: number;
};

export type MarketingImageLayer = MarketingLayerState & {
  id: string;
  type: "image";
  url: string;
  x: number;
  y: number;
  width: number;
  zIndex: number;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  borderStyle?: "none" | "solid" | "dashed" | "dotted" | "double";
};

export type MarketingShapeLayer = MarketingLayerState & {
  id: string;
  type: "shape";
  shapeType: "rect" | "circle" | "line";
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  borderRadius: number;
  zIndex: number;
};

export type MarketingEditorTemplate = {
  preset: "mobile" | "tablet" | "desktop";
  customSize: { width: number; height: number };
  useCustomSize: boolean;
  bgImage: string | null;
  bgType: "image" | "color" | "gradient";
  bgColor: string;
  bgGradient: string;
  filters: MarketingEditorFilters;
  textLayers: MarketingTextLayer[];
  imageLayers: MarketingImageLayer[];
  shapeLayers: MarketingShapeLayer[];
  snapToGrid: boolean;
  gridSize: number;
};

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function safeHex(value: unknown, fallback: string): string {
  const color = nonEmptyString(value, fallback);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function safeLinearGradient(value: unknown, fallback: string): string {
  const gradient = nonEmptyString(value, fallback);
  const colorStop = "#[0-9a-f]{6}(?:\\s+-?\\d+(?:\\.\\d+)?%)?";
  return new RegExp(`^linear-gradient\\(\\s*-?\\d+(?:deg|turn|rad|grad)?\\s*,\\s*${colorStop}(?:\\s*,\\s*${colorStop})+\\s*\\)$`, "i").test(gradient)
    ? gradient
    : fallback;
}

function normalizeLayerState(value: Record<string, unknown>) {
  return {
    opacity: Math.max(0, Math.min(1, finiteNumber(value.opacity, 1))),
    rotation: finiteNumber(value.rotation, 0),
    locked: value.locked === true,
    visible: value.visible !== false,
  };
}

export function normalizeMarketingTextLayer(raw: unknown, index: number): MarketingTextLayer {
  const value = recordOf(raw);
  const align = value.textAlign === "center" || value.textAlign === "right" ? value.textAlign : "left";
  return {
    id: nonEmptyString(value.id, `t_import_${index}`),
    type: "text",
    text: nonEmptyString(value.text, "New Text"),
    x: finiteNumber(value.x, 50),
    y: finiteNumber(value.y, 50),
    fontSize: finiteNumber(value.fontSize, 32),
    color: nonEmptyString(value.color, "#ffffff"),
    gradient: nonEmptyString(value.gradient, ""),
    fontFamily: nonEmptyString(value.fontFamily, "'Inter', sans-serif"),
    fontWeight: nonEmptyString(value.fontWeight, "700"),
    textAlign: align,
    shadow: value.shadow !== false,
    stroke: value.stroke === true,
    strokeColor: nonEmptyString(value.strokeColor, "#000000"),
    zIndex: finiteNumber(value.zIndex, finiteNumber(value.z, index + 1)),
    ...normalizeLayerState(value),
  };
}

export function normalizeMarketingImageLayer(raw: unknown, index: number): MarketingImageLayer {
  const value = recordOf(raw);
  const borderStyles = ["none", "solid", "dashed", "dotted", "double"] as const;
  const borderStyle = borderStyles.includes(value.borderStyle as typeof borderStyles[number])
    ? value.borderStyle as MarketingImageLayer["borderStyle"]
    : "none";
  return {
    id: nonEmptyString(value.id, `i_import_${index}`),
    type: "image",
    url: nonEmptyString(value.url, ""),
    x: finiteNumber(value.x, 50),
    y: finiteNumber(value.y, 50),
    width: finiteNumber(value.width, 200),
    zIndex: finiteNumber(value.zIndex, finiteNumber(value.z, index + 1)),
    borderColor: nonEmptyString(value.borderColor, "#000000"),
    borderWidth: finiteNumber(value.borderWidth, 0),
    borderRadius: finiteNumber(value.borderRadius, 0),
    borderStyle,
    ...normalizeLayerState(value),
  };
}

export function normalizeMarketingShapeLayer(raw: unknown, index: number): MarketingShapeLayer {
  const value = recordOf(raw);
  const shape = value.shapeType ?? value.type;
  const shapeType = shape === "circle" || shape === "line" ? shape : "rect";
  return {
    id: nonEmptyString(value.id, `s_import_${index}`),
    type: "shape",
    shapeType,
    x: finiteNumber(value.x, 100),
    y: finiteNumber(value.y, 100),
    width: finiteNumber(value.width, shapeType === "line" ? 200 : 120),
    height: finiteNumber(value.height, shapeType === "line" ? 4 : 120),
    fillColor: nonEmptyString(value.fillColor, "#3498db"),
    strokeColor: nonEmptyString(value.strokeColor, "#2980b9"),
    strokeWidth: finiteNumber(value.strokeWidth, shapeType === "line" ? 4 : 0),
    borderRadius: finiteNumber(value.borderRadius, 0),
    zIndex: finiteNumber(value.zIndex, finiteNumber(value.z, index + 1)),
    ...normalizeLayerState(value),
  };
}

/** Normalize current Node templates and the legacy PHP `texts/images/shapes` state. */
export function normalizeMarketingTemplate(raw: unknown): MarketingEditorTemplate {
  let source = raw;
  if (typeof source === "string") {
    try { source = JSON.parse(source) as unknown; } catch { source = {}; }
  }
  const value = recordOf(source);
  const custom = recordOf(value.customSize);
  const sourceFilters = recordOf(value.filters);
  const rawPreset = value.preset;
  const legacyCustom = rawPreset === "custom";
  const preset = rawPreset === "tablet" || rawPreset === "desktop" ? rawPreset : "mobile";
  const bgType = value.bgType === "color" || value.bgType === "gradient" ? value.bgType : "image";
  const fitValues = ["cover", "contain", "fill", "none", "scale-down"] as const;
  const rawFit = sourceFilters.bgFit;
  const bgFit = fitValues.includes(rawFit as typeof fitValues[number]) ? rawFit as MarketingEditorFilters["bgFit"] : "cover";
  const filters: MarketingEditorFilters = {
    brightness: finiteNumber(sourceFilters.brightness, finiteNumber(sourceFilters.b, 100)),
    contrast: finiteNumber(sourceFilters.contrast, finiteNumber(sourceFilters.c, 100)),
    grayscale: finiteNumber(sourceFilters.grayscale, finiteNumber(sourceFilters.g, 0)),
    blur: finiteNumber(sourceFilters.blur, 0),
    bgFit,
    bgScale: finiteNumber(sourceFilters.bgScale, 100),
    bgPosX: finiteNumber(sourceFilters.bgPosX, 50),
    bgPosY: finiteNumber(sourceFilters.bgPosY, 50),
  };
  const texts = Array.isArray(value.textLayers) ? value.textLayers : Array.isArray(value.texts) ? value.texts : [];
  const images = Array.isArray(value.imageLayers) ? value.imageLayers : Array.isArray(value.images) ? value.images : [];
  const shapes = Array.isArray(value.shapeLayers) ? value.shapeLayers : Array.isArray(value.shapes) ? value.shapes : [];
  const width = finiteNumber(custom.width, finiteNumber(value.customW, 400));
  const height = finiteNumber(custom.height, finiteNumber(value.customH, 800));

  return {
    preset,
    customSize: { width: Math.max(1, Math.min(4000, width)), height: Math.max(1, Math.min(4000, height)) },
    useCustomSize: typeof value.useCustomSize === "boolean" ? value.useCustomSize : legacyCustom,
    bgImage: bgType === "image"
      ? nonEmptyString(value.bgImage, nonEmptyString(value.bgUrl, "")) || null
      : null,
    bgType,
    bgColor: safeHex(value.bgColor, "#ffffff"),
    bgGradient: safeLinearGradient(value.bgGradient, "linear-gradient(45deg, #2193b0, #6dd5ed)"),
    filters,
    textLayers: texts.map(normalizeMarketingTextLayer),
    imageLayers: images.map(normalizeMarketingImageLayer),
    shapeLayers: shapes.map(normalizeMarketingShapeLayer),
    snapToGrid: value.snapToGrid === true,
    gridSize: Math.max(1, finiteNumber(value.gridSize, 10)),
  };
}

function cloneState<T>(state: T): T {
  return JSON.parse(JSON.stringify(state)) as T;
}

export class MarketingEditorHistory<T> {
  private undoStates: T[] = [];
  private redoStates: T[] = [];
  private readonly limit: number;

  constructor(limit = 50) {
    this.limit = Math.max(1, Math.floor(limit));
  }

  get canUndo(): boolean {
    return this.undoStates.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStates.length > 0;
  }

  record(current: T): void {
    const serialized = JSON.stringify(current);
    const latest = this.undoStates[this.undoStates.length - 1];
    if (latest !== undefined && JSON.stringify(latest) === serialized) return;

    this.undoStates.push(cloneState(current));
    if (this.undoStates.length > this.limit) this.undoStates.shift();
    this.redoStates = [];
  }

  undo(current: T): T | null {
    const previous = this.undoStates.pop();
    if (previous === undefined) return null;
    this.redoStates.push(cloneState(current));
    return cloneState(previous);
  }

  redo(current: T): T | null {
    const next = this.redoStates.pop();
    if (next === undefined) return null;
    this.undoStates.push(cloneState(current));
    if (this.undoStates.length > this.limit) this.undoStates.shift();
    return cloneState(next);
  }

  clear(): void {
    this.undoStates = [];
    this.redoStates = [];
  }
}

export function snapCoordinate(value: number, enabled: boolean, gridSize = 10): number {
  if (!enabled || !Number.isFinite(value)) return value;
  const size = Number.isFinite(gridSize) && gridSize > 0 ? gridSize : 10;
  return Math.round(value / size) * size;
}

export function fitCanvasZoom(
  viewportWidth: number,
  viewportHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  padding = 40,
  minZoom = 0.1,
  maxZoom = 1.5,
): number {
  if (canvasWidth <= 0 || canvasHeight <= 0) return minZoom;
  const availableWidth = Math.max(0, viewportWidth - padding);
  const availableHeight = Math.max(0, viewportHeight - padding);
  const scale = Math.min(availableWidth / canvasWidth, availableHeight / canvasHeight);
  return Math.max(minZoom, Math.min(maxZoom, scale));
}

export function removeChromaPixels(
  pixels: Uint8ClampedArray,
  targetHex: string,
  tolerance: number,
): Uint8ClampedArray | null {
  const match = /^#([0-9a-f]{6})$/i.exec(targetHex);
  if (!match || pixels.length % 4 !== 0) return null;

  const target = match[1];
  const targetRed = parseInt(target.slice(0, 2), 16);
  const targetGreen = parseInt(target.slice(2, 4), 16);
  const targetBlue = parseInt(target.slice(4, 6), 16);
  const safeTolerance = Math.max(1, Math.min(100, Number.isFinite(tolerance) ? tolerance : 15));
  const limit = safeTolerance * 2.55;
  const output = new Uint8ClampedArray(pixels);

  for (let i = 0; i < output.length; i += 4) {
    const red = output[i];
    const green = output[i + 1];
    const blue = output[i + 2];
    const distance = Math.sqrt(
      (red - targetRed) ** 2 + (green - targetGreen) ** 2 + (blue - targetBlue) ** 2,
    );
    if (distance < limit) output[i + 3] = 0;
  }

  return output;
}

export const MAX_MARKETING_SHARE_BYTES = 5 * 1024 * 1024;

const PNG_CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  return crc >>> 0;
});

function pngCrc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let index = start; index < end; index++) {
    crc = PNG_CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function hasValidPngStructure(bytes: Uint8Array): boolean {
  if (
    bytes.length < 45 ||
    bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d || bytes[5] !== 0x0a || bytes[6] !== 0x1a || bytes[7] !== 0x0a
  ) return false;

  let offset = 8;
  let hasHeader = false;
  let hasImageData = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const end = offset + 12 + length;
    if (end > bytes.length) return false;
    const storedCrc = bytes[end - 4] * 0x1000000 + (bytes[end - 3] << 16) + (bytes[end - 2] << 8) + bytes[end - 1];
    if (pngCrc32(bytes, offset + 4, end - 4) !== storedCrc) return false;
    if (!hasHeader) {
      if (type !== "IHDR" || length !== 13) return false;
      const width = bytes[offset + 8] * 0x1000000 + (bytes[offset + 9] << 16) + (bytes[offset + 10] << 8) + bytes[offset + 11];
      const height = bytes[offset + 12] * 0x1000000 + (bytes[offset + 13] << 16) + (bytes[offset + 14] << 8) + bytes[offset + 15];
      if (width < 1 || height < 1) return false;
      hasHeader = true;
    }
    if (type === "IDAT") hasImageData = true;
    if (type === "IEND") return length === 0 && hasHeader && hasImageData && end === bytes.length;
    offset = end;
  }
  return false;
}

function hasValidJpegStructure(bytes: Uint8Array): boolean {
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return false;
  if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return false;

  let offset = 2;
  let hasFrame = false;
  let hasScan = false;
  let frameComponents = 0;
  while (offset < bytes.length - 2) {
    if (bytes[offset] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) break;
    if (marker === 0xda) {
      if (offset + 2 > bytes.length - 2) return false;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      const scanComponents = bytes[offset + 2];
      if (length !== 6 + scanComponents * 2 || scanComponents !== frameComponents || offset + length >= bytes.length - 2) return false;
      hasScan = true;
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return false;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return false;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      const hasHeight = bytes[offset + 3] !== 0 || bytes[offset + 4] !== 0;
      const hasWidth = bytes[offset + 5] !== 0 || bytes[offset + 6] !== 0;
      frameComponents = bytes[offset + 7];
      if (length !== 8 + frameComponents * 3 || !hasHeight || !hasWidth || frameComponents === 0) return false;
      hasFrame = true;
    }
    offset += length;
  }
  return hasFrame && hasScan;
}

export function getMarketingShareExtension(
  contentType: string,
  bytes: Uint8Array,
): "jpeg" | "png" | null {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_MARKETING_SHARE_BYTES) return null;

  if (contentType === "image/jpeg" && hasValidJpegStructure(bytes)) return "jpeg";
  if (contentType === "image/png" && hasValidPngStructure(bytes)) return "png";

  return null;
}

export function isMarketingShareFilename(filename: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpeg|png)$/i.test(
    filename,
  );
}

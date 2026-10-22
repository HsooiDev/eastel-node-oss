import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import {
  fitCanvasZoom,
  getMarketingShareExtension,
  isMarketingShareFilename,
  MarketingEditorHistory,
  MAX_MARKETING_SHARE_BYTES,
  normalizeMarketingTemplate,
  removeChromaPixels,
  snapCoordinate,
} from "../lib/marketing-editor-model.ts";

const history = new MarketingEditorHistory(2);
const initial = { text: "Draft", layers: [{ x: 10 }] };
history.record(initial);
const edited = { text: "Edited", layers: [{ x: 20 }] };
const undone = history.undo(edited);
assert.deepEqual(undone, initial, "undo restores a deep copy of the prior editor state");
assert.equal(history.canRedo, true, "undo enables redo");
assert.deepEqual(history.redo(initial), edited, "redo restores the next editor state");
history.record(edited);
history.undo({ text: "Later", layers: [] });
history.record({ text: "New branch", layers: [] });
assert.equal(history.canRedo, false, "a new edit after undo clears the redo branch");
history.record({ text: "Second", layers: [] });
history.record({ text: "Third", layers: [] });
assert.equal(history.canUndo, true, "history remains available after reaching its configured limit");

const boundedHistory = new MarketingEditorHistory(2);
const cloneSource = { nested: ["original"] };
boundedHistory.record(cloneSource);
cloneSource.nested[0] = "mutated outside history";
boundedHistory.record({ nested: ["middle"] });
boundedHistory.record({ nested: ["latest"] });
assert.deepEqual(boundedHistory.undo({ nested: ["current"] }), { nested: ["latest"] }, "undo history clones nested state");
assert.deepEqual(boundedHistory.undo({ nested: ["latest"] }), { nested: ["middle"] }, "history respects its configured depth");
assert.equal(boundedHistory.undo({ nested: ["middle"] }), null, "undo stops when the bounded history is exhausted");

const noOpHistory = new MarketingEditorHistory();
noOpHistory.record({ text: "unchanged" });
noOpHistory.record({ text: "unchanged" });
assert.deepEqual(noOpHistory.undo({ text: "unchanged" }), { text: "unchanged" }, "identical adjacent snapshots are deduplicated");
assert.equal(noOpHistory.undo({ text: "unchanged" }), null, "no-op snapshots do not inflate history");

const cloneHistory = new MarketingEditorHistory();
const deepCloneSource = { nested: ["original"] };
cloneHistory.record(deepCloneSource);
deepCloneSource.nested[0] = "mutated after recording";
assert.deepEqual(cloneHistory.undo({ nested: ["current"] }), { nested: ["original"] }, "recorded snapshots are isolated deep copies");

const phpTemplate = normalizeMarketingTemplate({
  preset: "custom",
  customW: 1080,
  customH: 1350,
  bgType: "gradient",
  bgColor: "#123456",
  bgGradient: "linear-gradient(45deg, #112233, #aabbcc)",
  filters: { b: 112, c: 96, g: 12, blur: 2, bgFit: "contain", bgScale: 125, bgPosX: 35, bgPosY: 64 },
  texts: [{ id: "php-text", text: "Summer offer", x: 15, y: 25, z: 7, fontSize: 42 }],
  images: [{ id: "php-image", url: "/uploads/sample.jpg", x: 30, y: 40, z: 8, width: 180 }],
  shapes: [{ id: "php-shape", type: "circle", x: 80, y: 90, z: 9, width: 64, height: 64, fillColor: "#ff6600" }],
});
assert.equal(phpTemplate.useCustomSize, true, "PHP custom preset maps to the editor's custom size mode");
assert.deepEqual(phpTemplate.customSize, { width: 1080, height: 1350 }, "PHP customW/customH map to modern dimensions");
assert.equal(phpTemplate.bgType, "gradient", "legacy background type is retained");
assert.equal(phpTemplate.bgGradient, "linear-gradient(45deg, #112233, #aabbcc)", "safe legacy gradient is retained");
assert.equal(phpTemplate.filters.brightness, 112, "legacy brightness key is mapped");
assert.equal(phpTemplate.filters.contrast, 96, "legacy contrast key is mapped");
assert.equal(phpTemplate.filters.grayscale, 12, "legacy grayscale key is mapped");
assert.equal(phpTemplate.filters.blur, 2, "legacy blur filter is retained");
assert.equal(phpTemplate.filters.bgFit, "contain", "legacy image fit is retained");
assert.equal(phpTemplate.textLayers[0].type, "text", "legacy text receives the discriminator required by the Node renderer");
assert.equal(phpTemplate.textLayers[0].zIndex, 7, "legacy z is mapped to zIndex");
assert.equal(phpTemplate.imageLayers[0].type, "image", "legacy image receives the Node renderer discriminator");
assert.equal(phpTemplate.imageLayers[0].zIndex, 8, "legacy image z is mapped to zIndex");
assert.equal(phpTemplate.shapeLayers[0].type, "shape", "legacy shape receives the Node renderer discriminator");
assert.equal(phpTemplate.shapeLayers[0].shapeType, "circle", "legacy shape type is mapped to shapeType");
assert.equal(phpTemplate.shapeLayers[0].zIndex, 9, "legacy shape z is mapped to zIndex");
assert.equal(normalizeMarketingTemplate({ bgColor: "url(https://example.test/private)" }).bgColor, "#ffffff", "legacy background color rejects non-hex CSS values");
assert.equal(normalizeMarketingTemplate({ bgGradient: "url(https://example.test/private)" }).bgGradient, "linear-gradient(45deg, #2193b0, #6dd5ed)", "legacy gradient rejects arbitrary CSS URLs");

assert.equal(snapCoordinate(16, true, 10), 20, "snap rounds positive coordinates to the nearest grid point");
assert.equal(snapCoordinate(-16, true, 10), -20, "snap rounds negative coordinates consistently");
assert.equal(snapCoordinate(16, false, 10), 16, "snap leaves coordinates unchanged when disabled");
assert.equal(snapCoordinate(16, true, 0), 20, "invalid grid sizes fall back to ten pixels");
assert.equal(fitCanvasZoom(440, 840, 400, 800), 1, "fit leaves room around a canvas that already fits");
assert.equal(fitCanvasZoom(240, 300, 400, 800), 0.325, "fit uses the tighter viewport dimension");
assert.equal(fitCanvasZoom(2000, 2000, 400, 800), 1.5, "fit caps enlargement at the PHP editor maximum");

const sourcePixels = new Uint8ClampedArray([
  255, 255, 255, 255,
  0, 0, 0, 255,
  250, 250, 250, 37,
]);
const erasedPixels = removeChromaPixels(sourcePixels, "#ffffff", 15);
assert.deepEqual(Array.from(erasedPixels), [
  255, 255, 255, 0,
  0, 0, 0, 255,
  250, 250, 250, 0,
], "chroma erasing clears matching alpha while retaining unrelated pixels");
assert.equal(removeChromaPixels(sourcePixels, "white", 15), null, "invalid chroma colors fail closed");
assert.deepEqual(Array.from(sourcePixels.slice(0, 4)), [255, 255, 255, 255], "chroma processing does not mutate the source buffer");

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

const validPng = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  pngChunk("IHDR", Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])),
  pngChunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0, 255]))),
  pngChunk("IEND", Buffer.alloc(0)),
]);
const validJpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGhAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8Ak//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Ak//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Ak//Z",
  "base64",
);

assert.equal(getMarketingShareExtension("image/jpeg", validJpeg), "jpeg", "JPEG is checked for frame and scan structure");
assert.equal(getMarketingShareExtension("image/png", validPng), "png", "PNG is checked for header, data, and end chunks");
assert.equal(getMarketingShareExtension("image/jpeg", Uint8Array.of(0xff, 0xd8, 0xff, 0xd9)), null, "a signature-only JPEG is rejected");
assert.equal(getMarketingShareExtension("image/png", validJpeg), null, "MIME and actual file structure must agree");
assert.equal(getMarketingShareExtension("image/png", validPng.subarray(0, 16)), null, "truncated PNG data is rejected");
assert.equal(getMarketingShareExtension("image/svg+xml", Uint8Array.of(1, 2, 3)), null, "share uploads reject non-raster formats");
assert.equal(
  getMarketingShareExtension("image/jpeg", new Uint8Array(MAX_MARKETING_SHARE_BYTES + 1).fill(0xff)),
  null,
  "share uploads enforce the maximum image size",
);
assert.equal(isMarketingShareFilename("123e4567-e89b-42d3-a456-426614174000.jpeg"), true);
assert.equal(isMarketingShareFilename("../123e4567-e89b-42d3-a456-426614174000.jpeg"), false);
assert.equal(isMarketingShareFilename("not-a-token.png"), false);

process.stdout.write("PASS: marketing editor history, PHP template normalization, snapping, fit zoom, chroma erasing, and PNG/JPEG content guards\n");

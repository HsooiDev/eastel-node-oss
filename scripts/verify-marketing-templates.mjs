import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
let authenticated = false;
let databaseReads = 0;
let rows = [];

async function loadTs(relativePath, injected = {}) {
  const sourcePath = path.join(root, relativePath);
  const source = await fs.readFile(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: sourcePath,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module,
    exports: module.exports,
    console: { error() {}, log() {}, warn() {} },
    require(specifier) {
      if (Object.hasOwn(injected, specifier)) return injected[specifier];
      return require(specifier);
    },
  }, { filename: sourcePath });
  return module.exports;
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

const helpers = {
  async requireAdmin() {
    return authenticated ? { customerId: 7, isAdmin: true } : null;
  },
  success(value) {
    return jsonResponse({ status: "success", ...value });
  },
  error(message, status = 400) {
    return jsonResponse({ status: "error", message }, status);
  },
};
const db = {
  async query(sql) {
    databaseReads++;
    assert.match(sql, /`layout_json`/, "the template listing must select saved editor state");
    return [rows];
  },
};
const route = await loadTs("app/api/admin/marketing-templates/route.ts", {
  "../_helpers": helpers,
  "@/lib/db": { __esModule: true, default: db },
});
const model = await loadTs("lib/marketing-editor-model.ts");

const phpLayout = {
  preset: "custom",
  customW: 640,
  customH: 800,
  bgType: "gradient",
  bgColor: "#ffffff",
  bgGradient: "linear-gradient(135deg, #223c78, #e84675)",
  filters: { b: 108, c: 97, g: 4 },
  texts: [{ id: "legacy-text", text: "Synthetic PHP template", x: 14, y: 18, z: 3, fontSize: 30 }],
  images: [{ id: "legacy-image", url: "/synthetic/image.jpg", x: 20, y: 35, z: 4, width: 140 }],
  shapes: [{ id: "legacy-shape", type: "circle", x: 60, y: 70, z: 5, width: 80, height: 80 }],
};
const nodeLayout = {
  preset: "tablet",
  customSize: { width: 768, height: 1024 },
  useCustomSize: false,
  bgType: "color",
  bgColor: "#112233",
  filters: { brightness: 101, contrast: 103, grayscale: 2 },
  textLayers: [{ id: "node-text", type: "text", text: "Synthetic Node template", zIndex: 6 }],
  imageLayers: [{ id: "node-image", type: "image", url: "/synthetic/node.jpg", zIndex: 7 }],
  shapeLayers: [{ id: "node-shape", type: "shape", shapeType: "rect", zIndex: 8 }],
};
const promoLayout = {
  presetId: "mobile-story",
  agentName: "Synthetic agent",
  agentRank: "Synthetic rank",
  agentPhone: "000-0000",
  referralCode: "FIXTURE-ONLY",
  taglines: ["Synthetic promo line"],
};
rows = [
  { id: 101, template_name: "Synthetic legacy PHP", preview_image_url: "/synthetic/php.jpg", layout_json: JSON.stringify(phpLayout) },
  { id: 102, template_name: "Synthetic Node", preview_image_url: "/synthetic/node.jpg", layout_json: JSON.stringify(nodeLayout) },
  { id: 103, template_name: "[Ejen Card] Synthetic promo", preview_image_url: "/synthetic/promo.jpg", layout_json: JSON.stringify(promoLayout) },
  { id: 104, template_name: "Synthetic invalid JSON", preview_image_url: "/synthetic/invalid.jpg", layout_json: "{" },
  { id: 105, template_name: "Synthetic object JSON", preview_image_url: "/synthetic/object.jpg", layout_json: promoLayout },
];

authenticated = false;
const unauthorized = await route.GET();
assert.equal(unauthorized.status, 401, "unauthenticated listing is denied");
assert.equal(databaseReads, 0, "unauthenticated listing does not query template storage");

authenticated = true;
const response = await route.GET();
assert.equal(response.status, 200, "authenticated listing succeeds");
const body = await response.json();
assert.equal(databaseReads, 1, "authorized listing queries once");
assert.equal(body.templates.length, 5, "all synthetic stored templates are returned");
assert.deepEqual(JSON.parse(JSON.stringify(body.templates[0].layout_json)), phpLayout, "legacy PHP layout_json is decoded");
assert.deepEqual(JSON.parse(JSON.stringify(body.templates[1].layout_json)), nodeLayout, "Node layout_json is decoded");
assert.deepEqual(JSON.parse(JSON.stringify(body.templates[2].layout_json)), promoLayout, "promo-graphic layout_json is decoded without losing its page-specific fields");
assert.equal(body.templates[3].layout_json, null, "malformed stored JSON is returned as null without breaking the listing");
assert.deepEqual(JSON.parse(JSON.stringify(body.templates[4].layout_json)), promoLayout, "already-decoded database layout objects are preserved");

const [php, node] = body.templates.slice(0, 2).map((row) => model.normalizeMarketingTemplate(row.layout_json));
assert.equal(php.textLayers[0].type, "text", "PHP legacy text is normalized with its renderer type");
assert.equal(php.textLayers[0].zIndex, 3, "PHP legacy text z order survives route and normalization");
assert.equal(php.imageLayers[0].type, "image", "PHP legacy image survives route and normalization");
assert.equal(php.imageLayers[0].zIndex, 4, "PHP legacy image z order survives");
assert.equal(php.shapeLayers[0].shapeType, "circle", "PHP legacy shape survives route and normalization");
assert.equal(php.shapeLayers[0].zIndex, 5, "PHP legacy shape z order survives");
assert.equal(php.filters.brightness, 108, "PHP legacy filter keys survive");
assert.equal(php.useCustomSize, true, "PHP custom dimensions remain enabled");
assert.deepEqual(JSON.parse(JSON.stringify(php.customSize)), { width: 640, height: 800 });
assert.equal(node.textLayers[0].id, "node-text", "current Node text template remains compatible");
assert.equal(node.imageLayers[0].id, "node-image", "current Node image template remains compatible");
assert.equal(node.shapeLayers[0].shapeType, "rect", "current Node shape template remains compatible");
assert.equal(node.bgColor, "#112233", "current Node background remains compatible");
assert.equal(body.templates[2].layout_json.presetId, "mobile-story", "promo-graphic preset remains readable by its existing consumer");
assert.equal(body.templates[2].layout_json.agentName, "Synthetic agent", "promo-graphic agent fields remain readable");
assert.deepEqual(JSON.parse(JSON.stringify(body.templates[2].layout_json.taglines)), ["Synthetic promo line"], "promo-graphic taglines remain readable");

process.stdout.write("PASS: marketing-template GET auth guard, PHP/Node JSON decoding and normalization, and promo-graphic field compatibility\n");

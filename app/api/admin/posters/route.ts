import { NextRequest } from "next/server";
import { requireAdmin, requireAdminCsrf, success, error } from "../_helpers";
import fs from "fs/promises";
import { constants } from "node:fs";
import path from "path";
import { getMarketingPosterDirectory } from "@/lib/marketing-share-path";
import { listMarketingGallery } from "@/lib/marketing-gallery";

// Ensure directory exists
async function ensureDir() {
  const directory = getMarketingPosterDirectory();
  await fs.mkdir(directory, { recursive: true });
  const root = await fs.lstat(directory);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("Poster storage is unavailable.");
  await fs.access(directory, constants.W_OK | constants.X_OK);
  return directory;
}

export async function GET() {
  try {
    const session = await requireAdmin();
    if (!session) return error("Not authenticated.", 401);

    return success({ images: await listMarketingGallery() });
  } catch (e) {
    console.error("Admin posters GET error:", e);
    return error("Failed to load posters.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminCsrf(request);
    if (!session) return error("Not authenticated.", 401);

    const STORAGE_DIR = await ensureDir();
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return error("No file uploaded");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Generate safe filename
    const ext = file.name.split('.').pop() || 'png';
    const filename = `poster_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
    
    const filePath = path.join(STORAGE_DIR, filename);
    await fs.writeFile(filePath, buffer);

    return success({ 
      message: "File uploaded successfully",
      filename,
      url: `/api/admin/posters/${filename}`
    });
  } catch (e) {
    console.error("Admin posters POST error:", e);
    return error("Failed to upload poster.", 500);
  }
}

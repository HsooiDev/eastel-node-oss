import { NextResponse } from "next/server";
import { lstat, open } from "node:fs/promises";
import path from "path";
import { isMarketingShareFilename } from "@/lib/marketing-editor-model";
import { getMarketingShareDirectory } from "@/lib/marketing-share-path";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  if (!isMarketingShareFilename(filename)) return new NextResponse("Not found", { status: 404 });

  try {
    const SHARE_DIR = getMarketingShareDirectory();
    const root = await lstat(SHARE_DIR);
    if (!root.isDirectory() || root.isSymbolicLink()) return new NextResponse("Not found", { status: 404 });
    const filePath = path.join(SHARE_DIR, filename);
    const fileStat = await lstat(filePath);
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) return new NextResponse("Not found", { status: 404 });
    const handle = await open(filePath, "r");
    let image: Uint8Array<ArrayBuffer>;
    try {
      const contents = await handle.readFile();
      image = new Uint8Array(contents);
    } finally {
      await handle.close();
    }
    const contentType = filename.endsWith(".png") ? "image/png" : "image/jpeg";
    return new NextResponse(image, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

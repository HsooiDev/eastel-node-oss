import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../_helpers";
import fs from "fs/promises";
import path from "path";
import { getMarketingPosterDirectory } from "@/lib/marketing-share-path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const session = await requireAdmin();
    if (!session) return new NextResponse("Not authenticated.", { status: 401 });

    const { filename } = await params;
    
    // Prevent directory traversal
    if (filename.includes("..") || filename.includes("/")) {
      return new NextResponse("Invalid filename", { status: 400 });
    }

    const filePath = path.join(getMarketingPosterDirectory(), filename);
    
    try {
      const fileBuffer = await fs.readFile(filePath);
      
      let contentType = "image/png";
      const extension = path.extname(filename).toLowerCase();
      if (extension === ".jpg" || extension === ".jpeg") contentType = "image/jpeg";
      else if (extension === ".webp") contentType = "image/webp";

      return new NextResponse(fileBuffer, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch {
      return new NextResponse("File not found", { status: 404 });
    }
  } catch (e) {
    console.error("Admin posters file GET error:", e);
    return new NextResponse("Failed to load file.", { status: 500 });
  }
}

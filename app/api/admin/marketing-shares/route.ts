import { NextRequest } from "next/server";
import { error, requireAdminCsrf, success } from "../_helpers";
import { MAX_MARKETING_SHARE_BYTES, getMarketingShareExtension } from "@/lib/marketing-editor-model";
import { storeMarketingShare } from "@/lib/marketing-share-storage";
import { boundedUploadForm } from "@/lib/upload-storage";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminCsrf(request);
    if (!session) return error("Not authenticated.", 401);

    const formData = await boundedUploadForm(request);
    const file = formData.get("file");
    if (!(file instanceof File)) return error("A PNG or JPEG poster is required.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const extension = getMarketingShareExtension(file.type, bytes);
    if (!extension) return error(`Only valid PNG or JPEG posters up to ${MAX_MARKETING_SHARE_BYTES / (1024 * 1024)} MB are accepted.`);

    const url = await storeMarketingShare(bytes, extension);

    return success({ url });
  } catch (e) {
    if (e instanceof Error && /too large|timed out/i.test(e.message)) return error("The share image exceeds the 5 MB upload limit.", 413);
    if (e instanceof Error && /quota reached/i.test(e.message)) return error("Share storage is full. Contact the site maintainer to free space.", 507);
    console.error("Marketing share upload error:", e);
    return error("Failed to create a share link.", 500);
  }
}

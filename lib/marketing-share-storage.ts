import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { withDatabaseLock } from "@/lib/database-lock";
import { getMarketingShareDirectory } from "@/lib/marketing-share-path";

export const MAX_MARKETING_SHARE_TOTAL_BYTES = 512 * 1024 * 1024;

async function countStoredBytes(directory: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Share storage contains an unsupported link.");
    if (entry.isDirectory()) total += await countStoredBytes(fullPath);
    else if (entry.isFile()) total += (await stat(fullPath)).size;
  }
  return total;
}

export async function storeMarketingShare(bytes: Uint8Array, extension: "jpeg" | "png"): Promise<string> {
  return withDatabaseLock("marketing-share-storage", async () => {
    const SHARE_DIR = getMarketingShareDirectory();
    await mkdir(SHARE_DIR, { recursive: true });
    const root = await lstat(SHARE_DIR);
    if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("Share storage is unavailable.");
    const total = await countStoredBytes(SHARE_DIR);
    if (total + bytes.byteLength > MAX_MARKETING_SHARE_TOTAL_BYTES) throw new Error("Share storage quota reached.");

    const filename = `${randomUUID()}.${extension}`;
    const destination = path.join(SHARE_DIR, filename);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(destination, "wx");
      await handle.writeFile(bytes);
      await handle.close();
    } catch (cause) {
      if (handle) {
        await handle.close().catch(() => {});
        await unlink(destination).catch(() => {});
      }
      throw cause;
    }
    return `/api/marketing-shares/${filename}`;
  });
}

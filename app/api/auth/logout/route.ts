import { revokeSession } from "@/lib/session";
import { getSessionCookie, clearSessionCookie } from "@/lib/cookies";
import { success, error } from "../_helpers";

export async function POST() {
  try {
    const sessionId = await getSessionCookie();
    if (sessionId) await revokeSession(sessionId);
    await clearSessionCookie();
    return success();
  } catch (e) {
    console.error("Logout error:", e);
    return error("Logout failed.", 500);
  }
}

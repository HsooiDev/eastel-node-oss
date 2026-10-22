import type { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { issueAccountVerification } from "@/lib/account-verification";
import { requireSession, success, error } from "../_helpers";

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return error("Not authenticated.", 401);
    if (session.emailVerified) return success({ message: "Email already verified.", emailVerified: true });

    const rl = checkRateLimit(`verify:${session.customerId}`, 1, 60 * 1000);
    if (!rl.allowed) return error("Please wait before requesting another code.", 429);

    // Older clients send an empty POST; default safely without trusting a
    // submitted email or account identifier.
    const body = request ? await request.json().catch(() => null) : null;
    const locale = typeof body?.lang === "string" && ["en", "ms", "zh"].includes(body.lang) ? body.lang : "en";
    const verification = await issueAccountVerification(session.email, locale);
    if (!verification.sent) return error("Failed to send verification code. Please try again.", 502);
    return success({ message: "Verification code sent.", verificationToken: verification.token });
  } catch (e) {
    console.error("Resend code error:", e);
    return error("Failed to send verification code.", 500);
  }
}

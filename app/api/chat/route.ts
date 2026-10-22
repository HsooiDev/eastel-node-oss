import { NextResponse } from "next/server";
import { chatSchema, validate } from "@/lib/validation";
import { reservePublicInference } from "@/lib/ai/public-budget";
import { clientIp } from "@/lib/client-ip";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const SYSTEM_PROMPT = `You are Eastel Mobile's AI assistant. Help customers with plans, SIM registration, roaming, and general inquiries. Be friendly and concise. Always reply in the same language that the customer uses to talk to you. Current plans: EZ15 (RM15/30GB), EZ35 (RM35/200GB), EZ50 (RM50/500GB+3GB roaming), EZ68 (RM68/700GB+5GB roaming), EZ98 (RM98/999GB+10GB roaming). Booster add-ons: EZPLUS (RM10/30GB high-speed data, 10 days, available in Eastel App) and EZROAMPLUS (RM35/10GB roaming data with shared hotspot, follows roaming end date, Roaming Pass required). EZ365D is available in Eastel App: RM240, 240GB 5G/4G data, 30 minutes voice calls, 365 days validity. Customers can choose Buy Now on the plans page to continue through the existing website order flow. EZYEAR remains Coming Soon. Support hotline: 011-70337777. WhatsApp: 011-75999733.`;

export async function POST(request: Request) {
  let release: (() => void) | null = null;
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI service is not configured." },
        { status: 503 }
      );
    }

    const body = await request.json();

    const parsed = validate(chatSchema, body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.errors?.["_form"] || Object.values(parsed.errors ?? {})[0] || "Validation failed." },
        { status: 400 }
      );
    }
    const { message, history } = parsed.data;
    release = await reservePublicInference(`web:${clientIp(request)}`);
    if (!release) return NextResponse.json({ error: "rate_limit" }, { status: 429 });

    // Build conversation history for Gemini (last 10 messages max)
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    if (history && Array.isArray(history)) {
      const recentHistory = history.slice(-10);
      for (const msg of recentHistory) {
        if (msg.role === "user" || msg.role === "model") {
          contents.push({
            role: msg.role === "user" ? "user" : "model",
            parts: [{ text: msg.content }],
          });
        }
      }
    }

    // Add current message
    contents.push({
      role: "user",
      parts: [{ text: message.trim() }],
    });

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents,
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.7,
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return NextResponse.json(
          { error: "rate_limit" },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: "AI service is temporarily unavailable." },
        { status: 502 }
      );
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
        finishReason?: string;
      }>;
      error?: { message?: string };
    };

    if (data.error) {
      return NextResponse.json(
        { error: "AI service returned an error." },
        { status: 502 }
      );
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      return NextResponse.json(
        { error: "No response generated." },
        { status: 502 }
      );
    }

    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  } finally { release?.(); }
}

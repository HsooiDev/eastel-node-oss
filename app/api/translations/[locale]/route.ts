import { isValidLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { getTranslations } from "@/lib/i18n-server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> }
) {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    return Response.json(
      { status: "error", message: `Unsupported locale: ${locale}` },
      { status: 400 }
    );
  }

  const translations = await getTranslations(locale as Locale);
  return Response.json({ status: "success", data: translations });
}

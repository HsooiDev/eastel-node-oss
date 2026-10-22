import Script from "next/script";
import { headers } from "next/headers";
import { locales, isValidLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ToastProvider } from "@/components/ui/toast";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ConditionalChatWidget } from "@/components/layout/conditional-chat-widget";
import { VoucherBanner } from "@/components/layout/voucher-banner";
import { SITE_INDEXABLE, SITE_URL } from "@/lib/site";
import { publicPage } from "@/lib/seo-policy";
import { notFound } from "next/navigation";

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  const resolvedLocale = locale as Locale;

  // GA4 web tag — same property as the PHP site (PHP: js/main.js gtag).
  // Gated by NEXT_PUBLIC_GA4_ID so staging stays out of the stats;
  // set it on the production server at cutover (see CUTOVER.md).
  const requestHeaders = await headers();
  const configuredGaId = process.env.NEXT_PUBLIC_GA4_ID;
  const analyticsPath = requestHeaders.get("x-seo-pathname") || "";
  let referrerOrigin = "";
  try {
    const referrer = new URL(requestHeaders.get("referer") || "");
    if (["https:", "http:"].includes(referrer.protocol)) referrerOrigin = referrer.origin;
  } catch { /* An absent/invalid referrer is not an analytics source. */ }
  const gaId = SITE_INDEXABLE && publicPage(analyticsPath) && requestHeaders.get("x-seo-production") === "1" &&
    configuredGaId && /^G-[A-Z0-9]+$/.test(configuredGaId) ? configuredGaId : undefined;
  const nonce = gaId ? (requestHeaders.get("x-nonce") ?? undefined) : undefined;

  return (
    <div lang={locale} className="flex min-h-screen flex-col">
      {gaId && (
        <>
          <Script
            nonce={nonce}
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script nonce={nonce} id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}', {page_location: ${JSON.stringify(SITE_URL + analyticsPath)}, page_referrer: ${JSON.stringify(referrerOrigin)}});`}
          </Script>
        </>
      )}
      <ThemeProvider>
        <ToastProvider>
          <VoucherBanner locale={resolvedLocale} />
          <Header locale={resolvedLocale} />
          <main id="main-content" className="flex-1" style={{ paddingTop: "calc(4rem + var(--voucher-bar-h, 0px))" }}>
            {children}
          </main>
          <Footer locale={resolvedLocale} />
          <ConditionalChatWidget />
        </ToastProvider>
      </ThemeProvider>
    </div>
  );
}

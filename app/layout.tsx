import type { Metadata } from "next";
import { headers } from "next/headers";
import { SITE_URL, SITE_INDEXABLE } from "@/lib/site";
import { SITE_NAME } from "@/components/seo-head";
import "./globals.css";

const ogImage = `${SITE_URL}/images/og-banner.png`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  robots: { index: SITE_INDEXABLE, follow: true },
  title: {
    default: SITE_NAME,
    template: "%s | eastel.site",
  },
  description:
    "Buy an Eastel physical SIM card in Malaysia and check your SIM order. Mobile plans and roaming information are provided for reference.",
  manifest: "/manifest.json",
  icons: {
    icon: "/images/eastel.svg",
    apple: "/images/eastel.svg",
  },
  openGraph: {
    title: SITE_NAME,
    description:
      "Buy an Eastel physical SIM card in Malaysia and check your SIM order. Mobile plans and roaming information are provided for reference.",
    siteName: SITE_NAME,
    type: "website",
    locale: "ms_MY",
    images: [{ url: ogImage, width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description:
      "Eastel physical SIM card orders and help in Malaysia.",
    images: [ogImage],
  },
};

/**
 * Inline script to prevent theme flash.
 * Runs before CSS loads to apply data-theme from localStorage.
 */
const themeScript = `
(function(){
  try{
    var t=localStorage.getItem('eastel-theme');
    if(t==='light'||t==='dark'){
      document.documentElement.setAttribute('data-theme',t);
    }else if(window.matchMedia('(prefers-color-scheme:dark)').matches){
      document.documentElement.setAttribute('data-theme','dark');
    }
  }catch(e){}
})()
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  const requestedLocale = requestHeaders.get("x-locale");
  const documentLocale = requestedLocale === "en" || requestedLocale === "zh" || requestedLocale === "ms"
    ? requestedLocale === "zh" ? "zh-Hans" : requestedLocale
    : "ms";

  return (
    <html lang={documentLocale} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Security meta tags */}
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <meta
          httpEquiv="Permissions-Policy"
          content="camera=(), microphone=(), geolocation=()"
        />
      </head>
      <body suppressHydrationWarning>
        {children}
        <div id="wave-overlay" aria-hidden="true" />
      </body>
    </html>
  );
}

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n";
import { isValidLocale } from "@/lib/i18n";
import { getTranslations } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { getSessionCookie } from "@/lib/cookies";
import { validateSession } from "@/lib/session";
import Link from "next/link";
import { Package, User, Lock } from "lucide-react";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface AccountLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function AccountProtectedLayout({ children, params }: AccountLayoutProps) {
  const { locale } = await params;
  if (!isValidLocale(locale)) redirect("/ms/account/orders");

  const sessionId = await getSessionCookie();
  if (!sessionId) redirect(`/${locale}/account/login`);

  const session = await validateSession(sessionId);
  if (!session) redirect(`/${locale}/account/login`);
  if (!session.emailVerified) redirect(`/${locale}/account/verify-email`);

  const translations = await getTranslations(locale as Locale);

  const navItems = [
    { href: `/${locale}/account/orders`, label: t(translations, "account.navOrders", "Orders"), Icon: Package },
    { href: `/${locale}/account/profile`, label: t(translations, "account.navProfile", "Profile"), Icon: User },
    { href: `/${locale}/account/password`, label: t(translations, "account.navPassword", "Password"), Icon: Lock },
  ];

  const initials = session.name
    .split(" ")
    .map((n: string) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className="account-scope min-h-[calc(100vh-4rem)]"
      style={{ background: "var(--acc-page-bg)" }}
    >
      <div className="container-default py-10 sm:py-14">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar */}
          <aside className="w-full md:w-72 shrink-0">
            <div className="rounded-2xl backdrop-blur-sm bg-[color:var(--acc-surface)] border border-[color:var(--acc-border)] p-5">
              {/* User identity */}
              <div className="mb-5 pb-5 border-b border-[color:var(--acc-border)] flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/30 to-indigo-500/30 border border-[color:var(--acc-border-strong)] text-[color:var(--acc-text)] text-sm font-bold">
                  {initials || "EA"}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[color:var(--acc-text)] truncate">{session.name}</p>
                  <p className="text-xs text-[color:var(--acc-text-dim)] truncate">{session.email}</p>
                </div>
              </div>
              {/* Nav */}
              <nav className="space-y-0.5" aria-label="Account navigation">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[color:var(--acc-text-muted)] hover:bg-[color:var(--acc-surface-hover)] hover:text-[color:var(--acc-text)] transition-colors"
                  >
                    <item.Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </nav>
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}

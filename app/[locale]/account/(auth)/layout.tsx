import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isValidLocale } from "@/lib/i18n";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface AuthLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function AuthLayout({ children, params }: AuthLayoutProps) {
  const { locale } = await params;
  if (!isValidLocale(locale)) redirect("/ms/account/login");

  return <Suspense fallback={null}>{children}</Suspense>;
}

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionCookie } from "@/lib/cookies";
import { validateAdminSession } from "@/lib/session";
import { AdminShell } from "@/components/admin/shell";
import "./admin.css";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sessionId = await getSessionCookie();
  if (!sessionId) redirect("/hs/login");

  const session = await validateAdminSession(sessionId);
  if (!session || !session.isAdmin) redirect("/hs/login");

  return (
    <AdminShell name={session.name || "Admin"}>{children}</AdminShell>
  );
}

"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ParticleCanvas } from "@/components/home/ParticleCanvas";

interface AuthShellProps {
  title: string;
  description?: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  brandHref?: string;
}

export function AuthShell({
  title,
  description,
  eyebrow,
  children,
  footer,
  brandHref = "/",
}: AuthShellProps) {
  return (
    <div
      className="account-scope auth-bg relative min-h-[calc(100vh-4rem)] overflow-hidden isolate"
      style={{ background: "var(--acc-page-bg)" }}
    >
      {/* Background layers */}
      <ParticleCanvas />
      <div className="auth-aurora" aria-hidden="true" />
      <div className="auth-grid-floor" aria-hidden="true" />
      <div className="auth-vignette" aria-hidden="true" />

      {/* Content */}
      <div className="relative z-10 flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Back link */}
          <Link
            href={brandHref}
            className="inline-flex items-center gap-2 mb-8 text-sm font-medium text-[color:var(--acc-text-dim)] hover:text-[color:var(--acc-text-muted)] transition-colors"
          >
            <span aria-hidden>←</span>
            Back
          </Link>

          {/* Glass card */}
          <div
            className={[
              "rounded-2xl p-8 sm:p-10",
              "backdrop-blur-xl bg-[color:var(--acc-surface)] border border-[color:var(--acc-border)]",
              "[&_input]:bg-[color:var(--acc-input-bg)] [&_input]:border-[color:var(--acc-border-strong)]",
              "[&_input]:text-[color:var(--acc-text)] [&_input]:placeholder:text-[color:var(--acc-text-faint)]",
              "[&_input]:focus:ring-cyan-400/40 [&_input]:focus:border-cyan-400/60",
              "[&_select]:bg-[color:var(--acc-input-bg)] [&_select]:border-[color:var(--acc-border-strong)] [&_select]:text-[color:var(--acc-text)]",
            ].join(" ")}
          >
            {/* Header */}
            <div className="mb-8">
              {eyebrow && (
                <span className="inline-block mb-3 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
                  {eyebrow}
                </span>
              )}
              <h1 className="text-2xl font-bold tracking-tight text-[color:var(--acc-text)]">
                {title}
              </h1>
              {description && (
                <p className="mt-2 text-sm text-[color:var(--acc-text-muted)]">{description}</p>
              )}
            </div>

            {/* Form content */}
            {children}
          </div>

          {/* Footer links */}
          {footer && (
            <div className="mt-6 text-center text-sm text-[color:var(--acc-text-dim)] [&_a]:text-cyan-500 [&_a]:font-semibold [&_a:hover]:underline [&_button]:text-cyan-500 [&_button]:font-semibold [&_button:hover]:underline">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

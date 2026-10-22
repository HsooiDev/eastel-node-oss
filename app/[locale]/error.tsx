"use client";

// Branded error boundary for public pages — keeps the user inside the site
// instead of Next.js's unstyled default error screen.

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1
        className="text-[5rem] font-extrabold leading-none"
        style={{ color: "var(--color-accent)", textShadow: "0 2px 8px rgba(0,0,0,0.15)" }}
      >
        500
      </h1>
      <h2 className="mt-2 text-3xl font-bold">Something went wrong</h2>
      <p className="mt-4 max-w-md leading-relaxed text-foreground-muted">
        An unexpected error occurred. Please try again — if the problem
        persists, contact us on WhatsApp.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-foreground-muted">Ref: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="mt-10 inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-bold text-white transition-transform hover:-translate-y-0.5"
        style={{
          background: "linear-gradient(135deg, oklch(68% 0.21 250), oklch(55% 0.15 250))",
          boxShadow: "0 4px 16px rgba(3,105,161,0.3)",
        }}
      >
        Try again
      </button>
    </div>
  );
}

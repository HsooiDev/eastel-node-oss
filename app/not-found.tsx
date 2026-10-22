import Link from "next/link";

export default function NotFound() {
  return (
    <div className="bg-background text-foreground">
        <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
          <h1
            className="text-[6rem] font-extrabold leading-none"
            style={{ color: "var(--color-accent)", textShadow: "0 2px 8px rgba(0,0,0,0.15)" }}
          >
            404
          </h1>
          <h2 className="mt-2 text-3xl font-bold">Page Not Found</h2>
          <p className="mt-4 max-w-md text-foreground-muted leading-relaxed">
            Oops! The page you are looking for might have been removed, had its name
            changed, or is temporarily unavailable.
          </p>
          <Link
            href="/"
            className="mt-10 inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-bold text-white transition-transform hover:-translate-y-0.5"
            style={{
              background: "linear-gradient(135deg, oklch(68% 0.21 250), oklch(55% 0.15 250))",
              boxShadow: "0 4px 16px rgba(3,105,161,0.3)",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Back to Homepage
          </Link>
        </main>
    </div>
  );
}

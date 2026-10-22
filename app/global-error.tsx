"use client";

// Last-resort error boundary (errors in the root layout itself).
// Must render its own <html> and <body>.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0b0e15", color: "#e1e2ec" }}>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 16px",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "5rem", fontWeight: 800, lineHeight: 1, margin: 0, color: "#3388FF" }}>500</h1>
          <h2 style={{ marginTop: 8, fontSize: "1.75rem" }}>Something went wrong</h2>
          <p style={{ marginTop: 12, maxWidth: 420, lineHeight: 1.6, color: "#94A3B8" }}>
            An unexpected error occurred. Please try again.
          </p>
          {error.digest && <p style={{ marginTop: 8, fontSize: 12, color: "#94A3B8" }}>Ref: {error.digest}</p>}
          <button
            onClick={reset}
            style={{
              marginTop: 32,
              padding: "14px 28px",
              borderRadius: 9999,
              border: "none",
              fontWeight: 700,
              color: "#fff",
              cursor: "pointer",
              background: "linear-gradient(135deg, #3388FF, #0066FF)",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}

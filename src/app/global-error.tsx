"use client";
// The last resort, when even the page layout failed: plain HTML, no styles to lose.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#141c3c", color: "#fff", fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
        <div>
          <div style={{ fontSize: 56 }}>🍂</div>
          <h1 style={{ fontSize: 24 }}>Something went wrong</h1>
          <p style={{ color: "#cbd5e1" }}>Please try again in a moment.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "12px 20px", borderRadius: 12, border: 0, background: "#10b981", color: "#fff", fontWeight: 800, fontSize: 16 }}>Try again</button>
        </div>
      </body>
    </html>
  );
}

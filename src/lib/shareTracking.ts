// Count a share click from the browser (analytics; best effort, never blocks).
// `via`: "x" | "native" | "copy"; `page`: what was shared ("moment" | "profile").
export function trackShare(via: string, page: string): void {
  try {
    const body = JSON.stringify({ kind: "share_click", via, page });
    if (!navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) void fetch("/api/track", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true });
  } catch { /* never mind */ }
}

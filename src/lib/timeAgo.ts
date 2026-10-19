// "just now", "14 min ago", "2 h ago": how long since something happened. Pure.

export function agoText(at: number, now = Date.now()): string {
  const m = Math.floor((now - at) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}

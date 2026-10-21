// "Manage billing" in the browser: open the Stripe Customer Portal (change
// card, see invoices, cancel) through /api/billing/portal.

/** Go to the portal for a sponsor or billboard (by owner token), or the signed-in member. */
export async function manageBilling(kind: "billboard" | "sponsor" | "member", token: string, onError: (msg: string) => void): Promise<void> {
  const r = await fetch("/api/billing/portal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, token }) });
  const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
  if (j.url) window.location.assign(j.url);
  else onError(j.error ?? "Couldn't open billing.");
}

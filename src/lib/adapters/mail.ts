// Mail adapter: sends through Resend's HTTP API (no SDK, one fetch) when
// RESEND_API_KEY is set, from MAIL_FROM ("thegroove <hello@thegroove.fun>";
// the domain must be verified in Resend). Without a key, outside production
// the message is printed to the console (so reset links work locally); in
// production it's refused and logged. Swap in SMTP or another service here.

import type { MailMessage } from "@/types/mail";

const RESEND_URL = "https://api.resend.com/emails";

/** Send one email. True if it was handed to the mail service (or printed in development). */
export async function sendMail(msg: MailMessage): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      console.error("[mail] RESEND_API_KEY is not set: email not sent");
      return false;
    }
    console.log(`[mail] (development, not sent) to ${msg.to}: ${msg.subject}\n${msg.text}`);
    return true;
  }
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM ?? "thegroove <hello@thegroove.fun>", to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`[mail] send failed: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return res.ok;
  } catch (e) {
    console.error("[mail] send failed:", e instanceof Error ? e.message : e);
    return false;
  }
}

// The layout shared by the privacy policy and the terms: readable text on
// the game's night-sky colours, with a way back to the village.
import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL_UPDATED } from "@/lib/site";

export default function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-[#141c3c] px-4 py-6 text-stone-200">
      <article className="mx-auto max-w-2xl leading-relaxed [&_a]:text-amber-300 [&_a]:underline [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-extrabold [&_h2]:text-amber-300 [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
        <Link href="/" className="text-lg font-extrabold text-amber-300 no-underline">🌳 thegroove</Link>
        <h1 className="mt-4 text-3xl font-extrabold text-white">{title}</h1>
        <p className="text-sm text-stone-400">Last updated {LEGAL_UPDATED}</p>
        {children}
        <p className="mt-10 text-sm text-stone-400"><Link href="/guide">Player&apos;s guide</Link> · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/">Back to the village</Link></p>
      </article>
    </main>
  );
}

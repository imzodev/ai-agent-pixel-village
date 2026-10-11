"use client";
// Something broke while showing a page: say so kindly, offer a retry.
import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#141c3c] px-4 text-center text-white">
      <div>
        <div className="text-6xl">🍂</div>
        <h1 className="mt-3 text-2xl font-extrabold">Something went wrong</h1>
        <p className="mt-2 text-stone-300">A gust knocked the page over. Try again, and if it keeps happening, come back in a minute.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button onClick={reset} className="rounded-xl bg-emerald-500 px-5 py-3 font-extrabold shadow-lg hover:brightness-110">Try again</button>
          <Link href="/" className="rounded-xl bg-white/10 px-5 py-3 font-bold hover:bg-white/20">Back to the village</Link>
        </div>
        {error.digest && <p className="mt-4 text-[11px] text-stone-500">Error code {error.digest}</p>}
      </div>
    </main>
  );
}

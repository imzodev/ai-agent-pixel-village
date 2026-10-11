// A page that doesn't exist (or a player or moment that's gone).
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#141c3c] px-4 text-center text-white">
      <div>
        <div className="text-6xl">🌳</div>
        <h1 className="mt-3 text-2xl font-extrabold">Nothing grows here</h1>
        <p className="mt-2 text-stone-300">That page doesn&apos;t exist, or it&apos;s been moved.</p>
        <Link href="/" className="mt-5 inline-block rounded-xl bg-emerald-500 px-5 py-3 font-extrabold shadow-lg hover:brightness-110">Back to the village</Link>
      </div>
    </main>
  );
}

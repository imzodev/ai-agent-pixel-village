"use client";
import { useEffect } from "react";
import dynamic from "next/dynamic";

const Onboarding = dynamic(() => import("./Onboarding"), { ssr: false });

export default function ClientShell() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // Development: never run a service worker. It caches /_next/* responses
    // cache-first, but Turbopack regenerates chunk contents and ids on every
    // rebuild, so the worker ends up serving a stale module graph and the
    // app dies with "module factory is not available". Unregister any worker
    // installed by a previous run and drop its caches so the next load is
    // clean.
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {
          /* ignore */
        });
      if (typeof caches !== "undefined") {
        void caches
          .keys()
          .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          .catch(() => {
            /* ignore */
          });
      }
      return;
    }

    // updateViaCache: "none" so a changed sw.js is always re-fetched,
    // letting a cache-busting fix (like this one) take effect on the next
    // navigation instead of waiting out the HTTP cache.
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {
      // ignore — service worker is an enhancement
    });
  }, []);
  return <Onboarding />;
}

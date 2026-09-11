"use client";
import { useEffect } from "react";
import dynamic from "next/dynamic";

const Onboarding = dynamic(() => import("./Onboarding"), { ssr: false });

export default function ClientShell() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // ignore — service worker is an enhancement
      });
    }
  }, []);
  return <Onboarding />;
}

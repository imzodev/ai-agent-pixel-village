"use client";
// Remember (for a week) that this visitor arrived through a shared moment or
// profile, so their signup can be credited to sharing (analytics only).
import { useEffect } from "react";
import { REF_COOKIE } from "@/lib/site";

export default function RefMark({ from }: { from: string }) {
  useEffect(() => {
    if (!document.cookie.includes(`${REF_COOKIE}=`)) document.cookie = `${REF_COOKIE}=${encodeURIComponent(from)}; max-age=${7 * 86400}; path=/; samesite=lax`;
  }, [from]);
  return null;
}

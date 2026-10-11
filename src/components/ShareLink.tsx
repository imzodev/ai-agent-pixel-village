"use client";
// A share link (X post, …) that also counts the click (analytics).
import type { ReactNode } from "react";
import { trackShare } from "@/lib/shareTracking";

export default function ShareLink({ href, via, page, className, children }: { href: string; via: string; page: string; className?: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={() => trackShare(via, page)}>{children}</a>;
}

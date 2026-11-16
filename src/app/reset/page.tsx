import type { Metadata } from "next";
import ResetForm from "./ResetForm";

export const metadata: Metadata = {
  title: "Set a new password · thegroove",
  robots: { index: false, follow: false },
  // The token is in the URL: don't hand it to other sites.
  referrer: "no-referrer",
};

/** Where a password reset email's link lands (src/lib/passwordResetServer.ts). */
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <ResetForm token={token ?? ""} />;
}

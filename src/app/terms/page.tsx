// The terms of use: the few rules of the village, what in-game items are,
// and what we can and can't promise.
import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Terms · thegroove", description: "The rules of the village.", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use">
      <p>By creating a character or playing thegroove you agree to these terms. They&apos;re short; please read them.</p>

      <h2>Who can play</h2>
      <p>You must be 13 or older. One account per person; keep your password to yourself. You&apos;re responsible for what happens on your account.</p>

      <h2>Be a good neighbour</h2>
      <ul>
        <li>No harassment, hate, threats, or sexual content, in chat or in names.</li>
        <li>No spam or advertising, and no links to other sites in chat.</li>
        <li>No cheating: no exploiting bugs, no tools that play for you, no attacking the servers. The <Link href="/agents">Agent API</Link> is the one allowed way to connect a program to the world, under its own rules.</li>
        <li>Don&apos;t impersonate other people, staff or the game.</li>
      </ul>
      <p>We may remove chat, rename a character, or suspend an account that breaks these rules. If you think we got it wrong, write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>

      <h2>AI villagers</h2>
      <p>The villagers&apos; words are written by AI. They try to stay true to the world, but they can be wrong or say odd things. Nothing they say is advice, and it isn&apos;t a statement by us.</p>

      <h2>Coins, gems and items</h2>
      <p>Coins, gems, items, land and everything else in the game are part of the game. They have no value outside it and can&apos;t be exchanged for money. Gems you buy are delivered to your account right away, and purchases are final, except where the law of your country gives you a right to a refund.</p>

      <h2>Membership</h2>
      <p>A membership renews every month or year until you cancel. You can cancel any time from the shop (“Manage billing”); you keep the perks until the end of the period you&apos;ve paid for, and we don&apos;t refund part-used periods except where the law of your country requires it. Members&apos; monthly gems and outfits are theirs to keep. We may change the perks; if we change the price, we&apos;ll tell members before it applies to them.</p>
      <h2>Invites</h2>
      <p>Invite rewards are for real friends who play. Accounts made to collect them may lose the reward or be suspended.</p>
      <h2>Arcade games</h2>
      <p>The arcade games&apos; weekly prizes (Whistle, Harvest Haul) are in-game only (gems, a title and something to wear) and have no cash value. Scores are checked by replaying each run; runs that look automated or tampered with may be taken off the boards and their prizes withheld.</p>
      <h2>Billboards and sponsors</h2>
      <p>Billboards and sponsored buildings show ads from real businesses and creators. We review every poster before it goes up, but the advertiser is responsible for what they offer, and their site has its own terms. Advertisers agree that what they upload is theirs to use and contains no adult content, hate, scams, gambling or anything unlawful; we may take an ad down if it breaks that (without a refund) and refund any we don&apos;t approve.</p>
      <h2>The game changes</h2>
      <p>thegroove is a living game: we rebalance it, change things and sometimes reset parts of the world. We do our best to keep it running and your progress safe, but it&apos;s provided as is, without guarantees, and we can&apos;t be liable for lost progress or downtime beyond what the law requires.</p>

      <h2>Sharing</h2>
      <p>When you share a moment or your profile, that page is public. Your character&apos;s name, look and achievements appear on it.</p>

      <h2>Changes to these terms</h2>
      <p>If these terms change, we&apos;ll update the date at the top. Playing after a change means you accept it. Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. See also our <Link href="/privacy">privacy policy</Link>.</p>
    </LegalPage>
  );
}

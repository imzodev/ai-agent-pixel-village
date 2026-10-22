// The privacy policy: what thegroove keeps, why, who else sees it, and how
// to have it removed. Plain words; keep it true to what the code does.
import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy · thegroove", description: "What thegroove keeps about you, and why.", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <p>thegroove is a game you play in your browser. We keep as little about you as we can to run it. We don&apos;t sell your data, and there are no advertising trackers.</p>

      <h2>What we keep</h2>
      <ul>
        <li><b>Your account:</b> your username and your password, stored only as a salted hash (we can&apos;t read it). We don&apos;t ask for your email or real name.</li>
        <li><b>Your game:</b> your character&apos;s name and look, where they are, what they own, their progress, friends, and the things you do in the world.</li>
        <li><b>What you write:</b> chat that other players see, and what you say to the villagers (NPCs). Chat is public in the world; reports about a player keep their recent chat so we can review it.</li>
        <li><b>Basic play statistics:</b> things like when an account was created, which days it played, and whether the tutorial was finished, kept on our own server to understand how the game is doing. No third-party analytics.</li>
        <li><b>Purchases and memberships:</b> what you bought, when, and your membership&apos;s plan and renewal date, so we can deliver it and help if something goes wrong.</li>
        <li><b>Invites:</b> if you joined through someone&apos;s profile or shared moment, which player invited you, so you can both get the invite reward.</li>
        <li><b>Advertisers:</b> if you rent a billboard, your email, the poster you upload, its title and link, and how many players saw and clicked it. The poster (and its title and link) are public once approved. Uploaded images are re-drawn, so photo details like location are removed.</li>
        <li><b>Billboard views and clicks:</b> the game counts when a player stands by a billboard and when one is clicked, as totals for the advertiser. They don&apos;t learn who you are.</li>
        <li><b>Arcade runs</b> (Whistle, Harvest Haul): each run you send in (what you did and when, and its score), so it can be checked and replayed. Your character&apos;s name and best scores show on the public boards, and a run&apos;s replay page is public.</li>
        <li><b>Technical logs:</b> your IP address appears briefly in server logs and is used to stop abuse (for example, too many sign-in attempts).</li>
      </ul>

      <h2>Who else sees it</h2>
      <ul>
        <li><b>Other players</b> see your character, its name and title, your chat, and your public profile page with your achievements. Moments you choose to share are public pages.</li>
        <li><b>AI providers:</b> the villagers&apos; replies are written by an AI service (such as MiniMax, OpenAI or DeepSeek). What you say to a villager, your character&apos;s name and a short note of past conversations are sent to it to write the reply. Don&apos;t share personal information with villagers.</li>
        <li><b>Payments:</b> if you buy gems or a membership, or a business reserves a building or a billboard, the payment is handled by Stripe, which also keeps your billing email. We never see your card details; we get only a record of the payment and subscription.</li>
        <li><b>Advertisers&apos; sites:</b> when you click a billboard you leave thegroove for the advertiser&apos;s site, which has its own privacy policy. The link tells them you came from thegroove, nothing more.</li>
      </ul>

      <h2>Cookies</h2>
      <p>We use one cookie to keep you signed in, and one that helps route you to the right game server; both are needed for the game to work. Two short-lived first-party cookies remember where your first visit came from (such as a link someone shared) and whose invite brought you, for our own statistics and the invite reward. There are no advertising or third-party tracking cookies. The game may also store images on your device (in your browser&apos;s cache) so it loads faster.</p>

      <h2>How long we keep it</h2>
      <p>Your account and game are kept while you play. World chat is deleted after 30 days. What you&apos;ve said to the villagers is kept with your account, so they can remember you. Backups of the database are kept for about two weeks.</p>

      <h2>Your choices</h2>
      <p>You can ask us to show you what we keep about your account, or to delete your account and everything tied to it: write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from anywhere and tell us your username. We may ask you to prove the account is yours.</p>

      <h2>Children</h2>
      <p>thegroove is for players aged 13 and over. If you believe a younger child has an account, write to us and we&apos;ll remove it.</p>

      <h2>Changes</h2>
      <p>If this policy changes, we&apos;ll update the date at the top. Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </LegalPage>
  );
}

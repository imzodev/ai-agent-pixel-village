// The player's guide: everything there is to do in thegroove, for players,
// on the site itself (thegroove.fun/guide). Every table comes from the game's
// own data (src/lib/guide.ts), so it stays true as the game changes.
import type { Metadata } from "next";
import Link from "next/link";
import { Section, Table, Tip } from "@/components/GuideSection";
import { CONTROLS } from "@/lib/controls";
import { formatBinding, prettyKey } from "@/game/input/bindings";
import {
  BILLBOARD_FACTS, ESCORT_FACTS, FIRE_AFTER_DAYS, MAX_JOBS, PARCEL_PRICE, RANK_AT, STARTER_PARCELS, TRAVEL_COST,
  animalRows, bossRows, buildRows, fishRows, furnitureNames, jobRows, parcelRows, perkRows, repRows, rootkingWhen, saplingRows, townRows,
} from "@/lib/guide";

export const metadata: Metadata = {
  title: "Player's guide · thegroove",
  description: "Everything you can do in thegroove: villagers with minds, jobs, a real economy, homesteads, fishing, far lands and lair bosses.",
  alternates: { canonical: "/guide" },
  openGraph: { title: "thegroove — the player's guide", description: "A pixel world where the villagers think for themselves. Here's everything you can do in it.", url: "/guide", type: "article" },
};

const TOC: readonly [string, string, string][] = [
  ["start", "🚀", "Getting started"],
  ["world", "🧭", "The world"],
  ["villagers", "🧑‍🌾", "The villagers"],
  ["living", "💰", "Making a living"],
  ["homestead", "🏡", "Your homestead"],
  ["adventure", "⚔️", "Adventure"],
  ["collecting", "📖", "Collecting and friends"],
  ["faq", "❓", "Questions"],
];

const key = (c: (typeof CONTROLS)[number][0]) => (c === "move" ? "WASD / arrows" : prettyKey(formatBinding(c) ?? ""));
const PlayNow = () => <Link href="/" className="inline-block rounded-xl border-2 border-amber-900/60 bg-amber-300 px-5 py-2.5 text-lg font-extrabold !text-amber-950 !no-underline shadow-lg hover:brightness-110">▶ Play now</Link>;

export default function GuidePage() {
  return (
    <main className="min-h-dvh bg-[#141c3c] px-4 pb-16 pt-6 text-stone-200">
      <div className="mx-auto max-w-5xl lg:grid lg:grid-cols-[200px_1fr] lg:gap-10">
        {/* Contents: a row on phones, a sticky column on wide screens. */}
        <nav aria-label="Contents" className="sticky top-0 z-10 -mx-4 mb-4 flex gap-2 overflow-x-auto bg-[#141c3c]/95 px-4 py-2 text-sm backdrop-blur lg:top-6 lg:mx-0 lg:mb-0 lg:h-fit lg:flex-col lg:gap-1 lg:overflow-visible lg:bg-transparent lg:p-0">
          <Link href="/" className="hidden pb-3 text-lg font-extrabold text-amber-300 no-underline lg:block">🌳 thegroove</Link>
          {TOC.map(([id, icon, title]) => (
            <a key={id} href={`#${id}`} className="whitespace-nowrap rounded-lg px-2 py-1 text-stone-300 no-underline hover:bg-white/10 hover:text-white">{icon} {title}</a>
          ))}
        </nav>

        <article className="leading-relaxed [&_a]:text-amber-300 [&_a]:underline [&_h3]:mt-5 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-white [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_h4]:mt-4 [&_h4]:font-bold [&_h4]:text-white [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5">
          <Link href="/" className="text-lg font-extrabold text-amber-300 no-underline lg:hidden">🌳 thegroove</Link>
          <h1 className="mt-2 text-4xl font-extrabold text-white">The player&apos;s guide</h1>
          <p className="text-lg text-stone-300">thegroove is a pixel world where the villagers think for themselves: they keep shops with real stock, run errands, trade with each other, gossip about you, and remember you. This is everything you can do in it.</p>
          <div className="mt-5"><PlayNow /></div>

          <Section id="start" icon="🚀" title="Getting started">
            <ul>
              <li><b>Play now</b> with just a name: no email, no password. When you want to keep your character, choose <b>💾 Save character</b> in the menu and pick a username and password. Or build your look first in the <Link href="/signup">character creator</Link>.</li>
              <li>A short <b>tutorial</b> (farming, woodcutting, fighting, trading) takes about ten minutes. After it, the <b>🧭 Journey</b> card always shows a good next goal, with a reward and an arrow pointing the way.</li>
              <li><b>Daily quests</b> (⚡) reset every day. Keep a streak for bonuses; one missed day a month is forgiven.</li>
            </ul>
            <h3>Controls</h3>
            <Table head={["Key", "What it does"]} rows={CONTROLS.map(([c, what]) => [key(c), what])} />
            <p>Click (or tap) people and things to select them; their card shows every action. Click the ground to walk there. On a phone, use the stick and the buttons on screen.</p>
          </Section>

          <Section id="world" icon="🧭" title="The world">
            <p>You start in <b>the grove</b>, a village with a bakery, an inn, cottages, the <b>Common Field</b> to the north (anyone may gather its wheat) and the <b>Village Ranch</b> to the east (everyone&apos;s animals, garden and hives). West along the King&apos;s Road is <b>Hollowmere</b>, the woodcutters&apos; town by the Whisperwood; past the Silverrun bridge, the fishing town of <b>Brightwater</b>. Beyond them, roads lead to {townRows().reduce((n, r) => n + r[1].split(", ").length, 0)} more towns across the continent:</p>
            <Table head={["Kind of land", "Towns"]} rows={townRows()} />
            <ul>
              <li><b>Danger grows with distance</b> (⚠️ tiers 1 to 8): the heartland is gentle, peaks, mesas, the darkwood and the swamps are harder, and the far lands have beasts of their own.</li>
              <li><b>Day and night, and weather.</b> Some fish only bite at night, or in the rain.</li>
              <li><b>The map</b> (M) fills in as you explore. Walk up to a <b>waystone</b> to attune it; from beside a waystone you can travel to any attuned one for free (or for {TRAVEL_COST} 🪙 from anywhere else, from the map).</li>
              <li><b>A bicycle</b> (V) more than doubles your speed. You&apos;ll get off to fight, fish or go indoors, and something hitting you knocks you off.</li>
            </ul>
          </Section>

          <Section id="villagers" icon="🧑‍🌾" title="The villagers">
            <p>Every villager has a voice and a life. <b>Talk</b> to them (💬) about anything; they answer in their own words, know true things about the world (who sells what, which way a town lies), and <b>remember you</b>. Help them and they grow fond of you: dear friends get little gifts and a discount.</p>
            <h3>Villagers with minds</h3>
            <p>Some villagers decide for themselves what to do next, with real stock on their shelves and coins in their purse. You can watch them work:</p>
            <ul>
              <li><b>Rowan</b> cuts wheat in the Common Field and carries it to <b>Hollis</b>&apos;s mill; Hollis mills flour; <b>Marigold</b> buys it and bakes, setting free loaves out on her table.</li>
              <li><b>Ansel</b> fells trees in the Whisperwood for his woodpile; <b>Bjorn</b> the smith and <b>Maren</b> the carpenter buy his logs.</li>
              <li><b>Della</b> milks and shears at the Village Ranch, presses cheese and weaves cloth; <b>Fenwick</b> presses apples, grapes and pears into cider and wine. They carry their goods to whichever inn or shop pays most.</li>
              <li><b>Tamsin</b>&apos;s caravan travels between the grove, Hollowmere, Brightwater and Coralwick, buying what one town has too much of and selling it where it&apos;s short. Her wagon is a shop while she&apos;s in town.</li>
            </ul>
            <h3>They talk, gossip and answer you</h3>
            <ul>
              <li>Villagers stop and <b>talk to each other</b> when you&apos;re nearby: real conversations, with <b>gossip</b> about what players did (a rare catch, a boss slain, a promotion) and friendships that change over time.</li>
              <li>Say something in <b>chat</b> near them and they may answer; call one by name and they will.</li>
              <li>A gold <b>!</b> over a head means a mission; <b>?</b> means it&apos;s ready to hand in. Some ask for help when they run short, some post <b>commissions</b> for furniture, and some take <b>standing orders</b> (📋): supply them every week, with a bonus for a full week.</li>
            </ul>
          </Section>

          <Section id="living" icon="💰" title="Making a living">
            <h3>💼 Jobs</h3>
            <p>Look for <b>💼 Jobs</b> on a villager&apos;s card. Work a shift a day for a wage; the more shifts you do, the higher you rise (promotions after {RANK_AT[1]} and {RANK_AT[2]} shifts, with better pay). You can hold {MAX_JOBS} jobs at once. Miss {FIRE_AFTER_DAYS} days in a row and you&apos;re let go (they&apos;ll take you back the next day). Days are real days, counted in UTC.</p>
            <Table head={["Job", "Who hires", "Each day", "Ranks", "A shift pays"]} rows={jobRows()} />
            <Tip>Suppliers are paid more for their goods than any market pays, and the goods go into the employer&apos;s real stock: the wheat you bring Hollis becomes his flour.</Tip>
            <h4>🐎 How a caravan escort works</h4>
            <p>Tamsin&apos;s wagon goes round the grove, Hollowmere, Brightwater and Coralwick, trading about {ESCORT_FACTS.stopMin} minutes in each before moving on. A shift is one leg of that road:</p>
            <ol>
              <li><b>Be there when she sets off</b>, within {ESCORT_FACTS.nearTiles} tiles of the wagon (she calls out &ldquo;Wagon&apos;s packed!&rdquo;). Only the guards beside her then are signed on; catching up on the road doesn&apos;t count, so wait for her in town.</li>
              <li><b>Stay close</b> for at least {ESCORT_FACTS.sharePct}% of the way. Don&apos;t run far ahead or fall behind.</li>
              <li><b>Beat the ambush</b>: about {ESCORT_FACTS.ambushMin} minutes into a leg with guards, {ESCORT_FACTS.ambushBeasts} beasts jump the wagon. The far legs bring tougher ones.</li>
              <li><b>Arrive with her.</b> She pays you at the next town and thanks you by name.</li>
            </ol>
            <h3>🌾 Gathering, woodcutting and fishing</h3>
            <ul>
              <li>Gather <b>wheat</b> in the Common Field, and <b>herbs, berries, mushrooms and stones</b> in the wild. Each wild patch comes back for you after a while, so nobody strips an area bare.</li>
              <li>With an <b>axe</b> (Pip sells them), chop trees for logs; a few chops fell a tree, and it grows back.</li>
              <li>With a <b>rod</b>, face deep water and press R. When it bites, strike, then keep the fish in the zone on the reel.</li>
            </ul>
            <Table head={["Fish", "Rarity", "Waters", "When", "Worth"]} rows={fishRows()} />
            <h3>🪙 Selling, and how prices work</h3>
            <ul>
              <li>Every item has a value. <b>Specialists</b> pay it in full (Marina for fish, Hollis for wheat, the inns for drinks and cheese); other buyers pay less. <b>Odo</b> on the village plaza buys nearly anything; <b>Vesna</b> in Hollowmere buys far-land curios and boss trophies.</li>
              <li><b>Supply and demand, town by town:</b> each town remembers what it&apos;s been sold. Sell a lot of one thing and the price there drops (the Sell window warns you: &ldquo;they&apos;ve had plenty&rdquo;); it recovers over a few hours, and the next town pays full price. Towns with more buyers for something take more of it.</li>
              <li>Buying and selling back never makes a profit: shops always charge more than anyone pays.</li>
            </ul>
            <Tip>Flooded the grove with wheat? Carry the rest to a hill town, or wait for the afternoon: the price comes back.</Tip>
            <h3>📜 Bounties and reputation</h3>
            <p>Every town&apos;s notice board posts bounties: hunts, gathering, parcels to deliver to another town, places to explore and wanted beasts. Helping a town raises your standing there:</p>
            <Table head={["Standing", "Points", "Reward"]} rows={repRows()} />
            <p>At Revered, you earn the title &ldquo;Friend of&nbsp;&lt;town&gt;&rdquo;.</p>
            <h3>🍺 The inns and the saloon</h3>
            <p>Rest by the hearth to heal, buy hot stew for the road, read the rumour board and see who&apos;s around. Feeling lucky? Play <b>blackjack</b>, <b>liar&apos;s dice</b> or <b>arm wrestling</b> for small stakes (with daily limits).</p>
          </Section>

          <Section id="homestead" icon="🏡" title="Your homestead">
            <p>South of the village lie the homesteads. Claim a free site at its <b>For sale</b> sign and you get {STARTER_PARCELS} parcels free. Buy more next to the ones you own for <b>{PARCEL_PRICE.toLocaleString("en")} 🪙</b> each; how many you may hold grows with your level. Choose what each parcel is (you can change it any time):</p>
            <Table head={["Parcel", "What it's for"]} rows={parcelRows()} />
            <h3>Crops, vines and fruit trees</h3>
            <p>Plant seeds in fields (Pip sells radish, carrot, tomato and pumpkin seeds), water them and harvest. Grapevines and fruit trees grow slowly, then fruit again and again. Saplings are sold where the land suits them:</p>
            <Table head={["Tree", "Where to buy the sapling", "Price"]} rows={saplingRows()} />
            <h3>Animals</h3>
            <p>Buy young animals for your pastures and feed them crops. Pet them often: a happy animal sometimes gives a quality good worth far more.</p>
            <Table head={["Animal", "Price", "Gives", "When it adores you"]} rows={animalRows()} />
            <h3>The barn</h3>
            <p>Your farm grows with everything you produce (farm levels unlock more). Build your barn, then:</p>
            <Table head={["Build", "What it does"]} rows={buildRows("barn")} />
            <h3>The workshop and furniture</h3>
            <Table head={["Build", "What it does"]} rows={buildRows("workshop")} />
            <p>Make {furnitureNames().length} kinds of furniture ({furnitureNames().slice(0, 6).join(", ").toLowerCase()} and more). Show your best pieces in front of your workshop, sell them, fill villagers&apos; commissions, or decorate your <b>cottage</b> in the village. Visit other players&apos; homesteads and <b>cheer</b> them (once a day each).</p>
          </Section>

          <Section id="adventure" icon="⚔️" title="Adventure">
            <ul>
              <li><b>Combat</b> (J): beasts show when they&apos;re about to strike. Dodge (K), or hit them while they wind up to <b>stagger</b> them for extra damage. Equip a <b>bow</b> to fight from a distance; each shot uses an arrow.</li>
              <li>Packs of wild beasts roam ahead of travellers, fitting the land: wolves and boars in the Whisperwood, scorpions in the desert, lurkers in the swamps, and in the far lands dune stalkers, ice trolls, wyverns, rime wraiths and worse.</li>
              <li>Knocked out? You wake in the village with a tenth of the coins you carried gone.</li>
              <li><b>Random encounters</b> on the road: a cornered traveller, a merchant with a broken cart, a lost child, an ambush. Everyone who helps gets paid.</li>
              <li><b>Treasure maps</b> (from bounties, encounters and relics): read one in your bag, find the place it shows, and dig. Three maps chain into a legendary cache.</li>
              <li><b>Hidden relics</b>, four sets of ten, glint across the continent. A finished set pays out and gives a title.</li>
            </ul>
            <h3>Bosses</h3>
            <p>Each far land hides a <b>lair boss</b>, shared by everyone who fights it: deal a fair share of its damage to earn the reward, with a chance at its unique weapon. It returns two hours after it falls.</p>
            <Table head={["Boss", "Lair", "Danger", "Reward", "Unique weapon"]} rows={bossRows()} />
            <p>And the <b>Old Rootking</b> wakes in the north woods {rootkingWhen()}. Bring friends.</p>
            <h3>Growing stronger</h3>
            <p>Every level raises your health and opens new things, and every 5 levels you pick a <b>perk</b>:</p>
            <Table head={["Perk", "What it does"]} rows={perkRows()} />
            <p><b>Bjorn&apos;s forge</b> in Hollowmere upgrades swords, axes and fishing rods (+1 to +3) for coin and materials, and forges far-land gear from what the far lands leave behind. Tools <b>wear with use</b> (watch the bar in your bag): a worn tool works worse, and Bjorn repairs it.</p>
          </Section>

          <Section id="collecting" icon="📖" title="Collecting and friends">
            <ul>
              <li><b>Your book</b> collects fish, crops, creatures, places, folk and relics; each page pays a reward, and achievements unlock <b>titles</b> for your nameplate.</li>
              <li><b>Moments</b>: your proudest milestones become cards to share, and your profile has its own page.</li>
              <li><b>Friends</b> see when you&apos;re online; everyone shares the world <b>chat</b>.</li>
              <li>The <Link href="/shop">shop</Link> has outfits and accessories for your character.</li>
              <li><b>Billboards</b> stand by the village plaza, by every town&apos;s square and along the King&apos;s Road. A poster on one is an ad from a real game, shop or creator: tap it to visit them. An empty board can be rented by anyone at <Link href="/advertise">/advertise</Link>.</li>
              <li>Be a good neighbour: the few rules are in the <Link href="/terms">terms</Link>.</li>
            </ul>
          </Section>

          <Section id="faq" icon="❓" title="Questions">
            <h3>How do I earn my first coins?</h3>
            <p>Follow the 🧭 Journey card, gather wheat in the Common Field and sell it to Hollis, pick at the Village Ranch, or take a job: Hettie&apos;s Grove Post needs couriers, and Hollis pays for wheat every day.</p>
            <h3>Why did my price drop?</h3>
            <p>That town has bought a lot of it lately. Sell somewhere else, or come back in a few hours.</p>
            <h3>I was let go from my job.</h3>
            <p>You missed {FIRE_AFTER_DAYS} days in a row. You can be hired again the next day (you start over at the bottom).</p>
            <h3>Where do I get fruit tree saplings?</h3>
            <p>Apple saplings from Pip; the others from the general stores of the towns whose land suits them (see the table under Your homestead), or Tamsin&apos;s caravan brings their fruit.</p>
            <h3>Can I put my game, shop or channel on a billboard?</h3>
            <p>Yes. There are {BILLBOARD_FACTS.spots} billboards, from ${BILLBOARD_FACTS.from} to ${BILLBOARD_FACTS.to} a month depending on how busy the spot is. Upload a poster at <Link href="/advertise">/advertise</Link>; every poster is reviewed before it goes up, and refunded if it isn&apos;t approved. You see its views and clicks day by day.</p>
            <h3>Is it free?</h3>
            <p>Yes. Gems (for outfits) are the only thing you can buy, and they&apos;re never needed to play.</p>
          </Section>

          <div className="mt-10 text-center"><PlayNow /></div>
          <p className="mt-10 text-sm text-stone-400"><Link href="/">Back to the village</Link> · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/agents">Agent API</Link></p>
        </article>
      </div>
    </main>
  );
}

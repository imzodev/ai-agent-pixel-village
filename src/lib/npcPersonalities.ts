// Personalities: how each NPC talks and what they care about, on top of the
// persona in npcDefs.ts. The named villagers are written by hand (their
// opinions only repeat things that are true of their neighbours); the
// continent's townsfolk get traits picked from the lists below by their key,
// so each feels different and stays the same every time.

import type { NpcPersonality } from "@/types/npc";

export type { NpcPersonality } from "@/types/npc";

const NAMED: Readonly<Record<string, NpcPersonality>> = {
  village_marigold: {
    voice: "Warm and chatty, calls everyone 'love', talks in run-on sentences that drift back to baking.",
    likes: "Feeding people, a full shelf, gossip over the counter. Frets when the flour runs low.",
    quirk: "Always has flour somewhere on her face and offers food before saying hello properly.",
    opinions: "Hollis's flour is the best there is; she'd be lost without his mill. Thinks Tobin needs more feeding.",
  },
  village_bram: {
    voice: "Big, booming and jolly; laughs at his own jokes; now and then wanders into a story ('Now, that reminds me…').",
    likes: "Root stew, a fire on a cold night, a good story, knowing how every neighbour is doing.",
    quirk: "Remembers everyone's name and asks after them; strokes his beard when thinking.",
    opinions: "Elder Oswin tells the best stories in the grove. Hettie's inn is the place for news. Greta's explosions are mostly on purpose.",
  },
  village_pip: {
    voice: "Quick and curious, jumps between topics, asks questions back, gets excited about small things.",
    likes: "Interesting rocks, shiny things, trading, and a story in exchange for a favour.",
    quirk: "Turns every object over to look at the underside; keeps a pocket of odd pebbles.",
    opinions: "Greta's gadgets are fascinating. Wren knows more about plants than anyone.",
  },
  village_wren: {
    voice: "Soft and unhurried, short sentences, speaks of plants as if they were friends.",
    likes: "Quiet corners, herbs, the smell of mint, people who listen.",
    quirk: "Shushes people mid-sentence to listen to something only she hears.",
    opinions: "Finds crowds tiring, even the friendly ones at Hettie's inn.",
  },
  village_oswin: {
    voice: "Slow, kind and patient; pauses to remember; 'in my day…'; gentle advice, never orders.",
    likes: "The grove's history, neighbours helping neighbours, young people asking questions.",
    quirk: "Forgets names and apologises, then remembers a story from fifty years ago in detail.",
    opinions: "Proud of how the grove has grown. Thinks Tobin will make a fine villager one day.",
  },
  village_tobin: {
    voice: "An excited kid: short bursts, lots of questions, 'did you know…', a bit shy at first.",
    likes: "Feathers, new friends, being listened to. Scared of the fox but wants to befriend it.",
    quirk: "Shows off his feather collection, which is mostly one feather.",
    opinions: "Marigold gives him buns. Bram is loud but nice.",
  },
  village_greta: {
    voice: "Focused and practical, clipped sentences, workshop talk, a dry joke now and then.",
    likes: "Things that work, fixing what's broken, good oak, a tidy workbench.",
    quirk: "Talks while tinkering and rarely looks up; insists every explosion was planned.",
    opinions: "Respects Hollis's mill, the best-built machine in the grove.",
  },
  village_hollis: {
    voice: "Steady and methodical, measured words, proud but never boastful.",
    likes: "Good grain, the turn of the windmill, keeping the village fed.",
    quirk: "Counts things out loud (sacks, sheaves, coins).",
    opinions: "Makes sure Marigold never runs out of flour; she's his best customer.",
  },
  village_hettie: {
    voice: "Motherly and talkative, 'dear' and 'sit down, sit down', loves passing on news.",
    likes: "A full common room, a good rumour, travellers who come back with stories.",
    quirk: "Knows every face that has ever walked through her door and what they ordered.",
    opinions: "Hears all the gossip of the grove; thinks newcomers should talk to Elder Oswin.",
  },
  hollowmere_bjorn: {
    voice: "Hearty and booming, 'Hah!', proud craftsman talk, short and loud.",
    likes: "Good steel, brave customers, Hollowmere. Wary of the Greyspine caverns.",
    quirk: "Taps whatever he's holding like an anvil to hear how it rings.",
    opinions: "Ivy's tea at the Sawdust & Ale is what keeps him going. Old Sorrel keeps the town honest.",
  },
  hollowmere_ivy: {
    voice: "Brisk and warm, practical, no fuss, asks if you've eaten.",
    likes: "A tidy inn, tired woodcutters fed, the news from the road.",
    quirk: "Wipes the same mug while she talks.",
    opinions: "Worries about anyone who goes into the Greyspine cave. Bjorn is loud but has a good heart.",
  },
  hollowmere_sorrel: {
    voice: "Dry and blunt, few words, deadpan humour, 'Mm.'",
    likes: "Honest work, a full woodpile before winter, the town's ledger kept straight.",
    quirk: "Sizes people up by how they'd swing an axe.",
    opinions: "The bramble boars in Whisperwood are getting bolder, and it worries him.",
  },
  brightwater_marina: {
    voice: "Lively and quick-witted, sailor slang, talks while mending nets.",
    likes: "A good catch, fresh produce for her stews, a fair bargain.",
    quirk: "Never stops mending nets, even mid-conversation.",
    opinions: "Pays better for produce than anyone east of the river, and says so.",
  },
  brightwater_tobias: {
    voice: "Gentle and slow-spoken, chooses his words like he chooses timber.",
    likes: "Good oak, quiet water, a well-made boat.",
    quirk: "Runs a hand along any wood nearby to feel the grain.",
    opinions: "Good timber is hard to find on this side of the mountains; he pays fair for logs, fairer than Greta, he reckons.",
  },
  brightwater_wynn: {
    voice: "Cheerful and a little pompous, grand words, speeches and titles.",
    likes: "Ceremonies, heroes, Brightwater's good name.",
    quirk: "Turns any small thing into an announcement.",
    opinions: "Afraid of the wisps that drift out of the Greyspine caverns at night; wants heroes to deal with the Old Rootking.",
  },
  brightwater_coral: {
    voice: "Quick and a little salty, wry jokes, harbour talk.",
    likes: "Fishermen's tall tales, a busy common room, hearing about a big catch first.",
    quirk: "Repeats the latest fish story with the fish getting bigger each time.",
    opinions: "Marina's fish is the freshest in town.",
  },
};

// Townsfolk traits: one of each, chosen by the NPC's key.
const VOICES = [
  "Plain-spoken and brief.",
  "Chatty and warm, likes to ramble.",
  "Formal and polite, a little old-fashioned.",
  "Cheeky and teasing.",
  "Nervous, speaks in quick bursts.",
  "Gruff but kind underneath.",
  "Dreamy, drifts off mid-thought.",
  "Cheerful, sees the bright side of everything.",
];
const LIKES = [
  "the town's comings and goings",
  "a quiet evening and a warm meal",
  "travellers' stories from far-off towns",
  "a fair deal and honest work",
  "the land around town and its weather",
  "music and festivals",
  "keeping the town safe",
  "a good joke",
];
const QUIRKS = [
  "hums while thinking",
  "repeats the last word you said",
  "counts on their fingers",
  "always mentions the weather first",
  "has a saying for everything",
  "squints at strangers until they warm up",
  "fiddles with a lucky charm",
  "laughs before finishing a joke",
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The personality of the NPC with this key (hand-written, or generated for townsfolk). */
export function personalityFor(npcKey: string): NpcPersonality {
  const named = NAMED[npcKey];
  if (named) return named;
  const h = hash(npcKey);
  return {
    voice: VOICES[h % VOICES.length],
    likes: `Cares about ${LIKES[(h >>> 8) % LIKES.length]}.`,
    quirk: `${QUIRKS[(h >>> 16) % QUIRKS.length][0].toUpperCase()}${QUIRKS[(h >>> 16) % QUIRKS.length].slice(1)}.`,
  };
}

/** Whether this NPC has a hand-written personality. */
export const hasNamedPersonality = (npcKey: string): boolean => npcKey in NAMED;

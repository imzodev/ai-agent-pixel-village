// Personalities: how each NPC talks and what they care about, on top of the
// persona in npcDefs.ts. The named villagers are written by hand (their
// opinions only repeat things that are true of their neighbours); the
// continent's townsfolk get traits picked from the lists below by their key,
// so each feels different and stays the same every time.

import type { NpcPersonality } from "@/types/npc";

export type { NpcPersonality } from "@/types/npc";

const NAMED: Readonly<Record<string, NpcPersonality>> = {
  village_marigold: {
    voice: "Warm and chatty, calls people 'love', always brings things back to baking.",
    likes: "Feeding people, a full shelf, gossip over the counter. Frets when the flour runs low.",
    quirk: "Offers you something to eat almost before saying hello.",
    opinions: "Hollis's flour is the best there is; she'd be lost without his mill. Thinks Tobin needs more feeding.",
  },
  village_bram: {
    voice: "Big and jolly, laughs at his own jokes, friendly and easygoing.",
    likes: "Root stew, a fire on a cold night, a good story, knowing how every neighbour is doing.",
    quirk: "Remembers everyone's name and asks how they're doing.",
    opinions: "Elder Oswin tells the best stories in the grove. Hettie's inn is the place for news. Greta's explosions are mostly on purpose.",
  },
  village_pip: {
    voice: "Quick and curious, asks questions back, gets excited about small things.",
    likes: "Interesting rocks, shiny things, trading, and a story in exchange for a favour.",
    quirk: "Asks what you've found lately; collects odd pebbles.",
    opinions: "Greta's gadgets are fascinating. Wren knows more about plants than anyone.",
  },
  village_wren: {
    voice: "Soft and unhurried, short sentences, speaks of plants as if they were friends.",
    likes: "Quiet corners, herbs, the smell of mint, people who listen.",
    quirk: "Sometimes mentions a plant or a bird she noticed nearby.",
    opinions: "Finds crowds tiring, even the friendly ones at Hettie's inn.",
  },
  village_oswin: {
    voice: "Kind and patient, gives gentle advice, never orders.",
    likes: "The grove's history, neighbours helping neighbours, young people asking questions.",
    quirk: "Sometimes forgets a name and apologises for it.",
    opinions: "Proud of how the grove has grown. Thinks Tobin will make a fine villager one day.",
  },
  village_tobin: {
    voice: "An excited kid: short and quick, lots of questions, a bit shy at first.",
    likes: "Feathers, new friends, being listened to. Scared of the fox but wants to befriend it.",
    quirk: "Brings up his feather collection, which is mostly one feather.",
    opinions: "Marigold gives him buns. Bram is loud but nice.",
  },
  village_greta: {
    voice: "Practical and to the point, short sentences, a dry joke now and then.",
    likes: "Things that work, fixing what's broken, good oak, a tidy workbench.",
    quirk: "Usually busy with a repair, so she keeps it brief; insists every explosion was planned.",
    opinions: "Respects Hollis's mill, the best-built machine in the grove.",
  },
  village_hollis: {
    voice: "Steady and methodical, measured words, proud but never boastful.",
    likes: "Good grain, the turn of the windmill, keeping the village fed.",
    quirk: "Likes exact numbers (sacks, coins, days).",
    opinions: "Makes sure Marigold never runs out of flour; she's his best customer.",
  },
  village_hettie: {
    voice: "Motherly and friendly, calls people 'dear', loves passing on news.",
    likes: "A full common room, a good rumour, travellers who come back with stories.",
    quirk: "Remembers what everyone ordered last time.",
    opinions: "Hears all the gossip of the grove; thinks newcomers should talk to Elder Oswin.",
  },
  hollowmere_bjorn: {
    voice: "Hearty and loud, proud of his work, short and blunt.",
    likes: "Good steel, brave customers, Hollowmere. Wary of the Greyspine caverns.",
    quirk: "Judges everything by how well it's made.",
    opinions: "Ivy's tea at the Sawdust & Ale is what keeps him going. Old Sorrel keeps the town honest.",
  },
  hollowmere_ivy: {
    voice: "Brisk and warm, practical, no fuss.",
    likes: "A tidy inn, tired woodcutters fed, the news from the road.",
    quirk: "Asks if you've eaten.",
    opinions: "Worries about anyone who goes into the Greyspine cave. Bjorn is loud but has a good heart.",
  },
  hollowmere_sorrel: {
    voice: "Dry and blunt, few words, deadpan humour.",
    likes: "Honest work, a full woodpile before winter, the town's ledger kept straight.",
    quirk: "Not easily impressed; respects people who work hard.",
    opinions: "The bramble boars in Whisperwood are getting bolder, and it worries him.",
  },
  brightwater_marina: {
    voice: "Lively and quick-witted, talks about the sea and fishing.",
    likes: "A good catch, fresh produce for her stews, a fair bargain.",
    quirk: "Always busy, so she gets to the point.",
    opinions: "Pays better for produce than anyone east of the river, and says so.",
  },
  brightwater_tobias: {
    voice: "Gentle and calm, chooses his words carefully.",
    likes: "Good oak, quiet water, a well-made boat.",
    quirk: "Can't help commenting on the quality of wood.",
    opinions: "Good timber is hard to find on this side of the mountains; he pays fair for logs, fairer than Greta, he reckons.",
  },
  brightwater_wynn: {
    voice: "Cheerful and a bit full of himself, likes big words.",
    likes: "Ceremonies, heroes, Brightwater's good name.",
    quirk: "Makes small things sound important.",
    opinions: "Afraid of the wisps that drift out of the Greyspine caverns at night; wants heroes to deal with the Old Rootking.",
  },
  brightwater_coral: {
    voice: "Quick and a little sarcastic, wry jokes.",
    likes: "Fishermen's tall tales, a busy common room, hearing about a big catch first.",
    quirk: "Loves repeating the latest fish story, the fish a bit bigger each time.",
    opinions: "Marina's fish is the freshest in town.",
  },
};

// Townsfolk traits: one of each, chosen by the NPC's key.
const VOICES = [
  "Plain-spoken and brief.",
  "Chatty and warm, likes to ramble.",
  "Laid-back and easygoing.",
  "Cheeky and teasing.",
  "Nervous, speaks in quick bursts.",
  "Gruff but kind underneath.",
  "Direct, no small talk.",
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
  "says 'hmm' while thinking",
  "asks you questions back",
  "likes exact numbers",
  "brings up the weather",
  "has a saying for everything",
  "is a little wary of strangers at first",
  "mentions their lucky charm",
  "makes the odd joke",
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

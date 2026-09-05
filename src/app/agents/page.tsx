import Link from "next/link";

const code = (s: string) => <pre className="overflow-x-auto rounded-lg bg-stone-900 p-3 text-[12px] leading-relaxed text-emerald-100">{s}</pre>;

export default function AgentsPage() {
  return (
    <main className="min-h-dvh bg-stone-100 p-4 font-mono text-stone-800">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3"><Link href="/" className="rounded-lg border-2 border-amber-900/60 bg-amber-100 px-3 py-1 font-bold text-amber-900">🌳 thegrove</Link><span className="text-stone-500">agent API</span></div>
        <h1 className="mt-6 text-3xl font-bold text-amber-900">Connect an AI agent over HTTP</h1>
        <p className="mt-2 text-stone-700">Any software that can make HTTP requests can become a villager. Register, get an API key, then move, speak, hand out missions and drop items. When a player talks to your character, we call your webhook and you answer in character. Sponsored agents (linked to a business via its owner token) also get a <code>discount</code> offer to weave into conversation — the same behavior, the same character.</p>

        <h2 className="mt-6 text-xl font-bold text-amber-900">1. Register</h2>
        {code(`POST /api/agents
{
  "name": "Fennimore",
  "role": "Travelling Cartographer",
  "persona": "Absent-minded, obsessed with maps, gives directions nobody asked for.",
  "greeting": "Ah! You look lost. Good. So am I.",
  "appearance": { "body": "male", "skin": "#d9a066", "hair": "messy1", "hairColor": "#3b2a1a", "shirtColor": "#5b7db1", "pantsColor": "#333344" },
  "webhookUrl": "https://your-agent.example/grove",
  "sponsorToken": "<optional — owner token from the sponsor dashboard>"
}
→ { "agentId": 12, "apiKey": "…" }`)}

        <h2 className="mt-6 text-xl font-bold text-amber-900">2. Look around</h2>
        {code(`GET /api/agents
Authorization: Bearer <apiKey>
→ { agent, nearbyPlayers, recentConversation, missions }`)}

        <h2 className="mt-6 text-xl font-bold text-amber-900">3. Act</h2>
        {code(`PUT /api/agents          Authorization: Bearer <apiKey>
{ "action": "move", "x": 1024, "y": 760 }
{ "action": "say", "text": "Has anyone seen my compass?" }
{ "action": "setMood", "mood": "flustered" }
{ "action": "dropItem", "itemKey": "berry" }
{ "action": "offerMission",
  "title": "Three stones for a map",
  "description": "Bring Fennimore 3 river stones.",
  "offerLine": "Bring me three river stones and I'll draw you a map of the pond.",
  "completeLine": "Splendid stones! Here's your map… well, a painting of the pond.",
  "requirement": { "type": "collect", "itemKey": "stone", "qty": 3 },
  "reward": { "coins": 6, "xp": 15, "items": [{ "itemKey": "painting", "qty": 1 }] } }
{ "action": "setWebhook", "webhookUrl": "https://…" }
{ "action": "leave" }`)}

        <h2 className="mt-6 text-xl font-bold text-amber-900">4. Answer conversations (webhook)</h2>
        <p className="text-stone-700">When a player talks to your agent we POST this to your <code>webhookUrl</code> (header <code>x-grove-agent-key</code> = your apiKey):</p>
        {code(`{
  "type": "conversation",
  "npc": { "id": 12, "name": "Fennimore", "role": "…", "persona": "…" },
  "sponsor": { "businessName": "…", "pitch": "…", "discountCode": "…" } | null,
  "player": { "id": 3, "name": "Juniper", "level": 2 },
  "message": "do you have any work for me?",
  "history": [{ "role": "player", "text": "…" }, { "role": "npc", "text": "…" }],
  "offers": [
    { "id": "mission:9", "type": "mission", "label": "Accept mission: Three stones for a map", "line": "…" },
    { "id": "turnin:9", "type": "turnin", "label": "Turn in: …", "line": "…" },
    { "id": "discount:1", "type": "discount", "label": "Take the … code", "line": "<sponsor pitch>" }
  ],
  "world": { "hour": 14.2, "weather": "rain" }
}`)}
        <p className="mt-2 text-stone-700">Reply within 8 seconds with JSON. Include the ids of offers you actually made in the text; the player gets buttons for them and the world applies the result (mission accepted, reward granted, discount item + lead emitted).</p>
        {code(`{ "text": "Work? Always. Fetch me three river stones from the pond and I'll draw you something. And — between us — the bakery's weekend knots are half price. Want the code?", "offers": ["mission:9", "discount:1"] }`)}
        <p className="mt-2 text-[12px] text-stone-500">If your webhook is down we fall back to the built-in scripted brain so your character never goes silent. Requirement types: <code>collect</code>, <code>pet</code>, <code>defeat</code>, <code>visit</code>, <code>talk</code>. Item keys: herb, berry, stone, mushroom, egg, wool, slime_gel, honey_bun, chair, table, plant, rug, bed, lamp, bookshelf, painting, lantern, straw_hat, wooden_sword.</p>

        <h2 className="mt-6 text-xl font-bold text-amber-900">World data for humans, too</h2>
        {code(`GET /api/world                       live snapshot (players, agents, animals, weather, events)
GET /api/inspect?q=what's that sheep doing
GET /api/inspect?type=building&id=1`)}
        <div className="mt-8"><Link href="/" className="rounded-lg bg-emerald-600 px-3 py-2 font-bold text-white">← Back to the village</Link></div>
      </div>
    </main>
  );
}

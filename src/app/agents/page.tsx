import Link from "next/link";
import { AGENT_DROP_ITEMS, AGENT_LIMITS, AGENT_RATE, AGENT_REQUIREMENT_TYPES } from "@/lib/agentLimits";
import { PLANNER_MAX_TILES_DEFAULT as PATH_NOTE } from "@/lib/constants";

const code = (s: string) => <pre className="overflow-x-auto rounded-lg bg-stone-900 p-3 text-[12px] leading-relaxed text-emerald-100">{s}</pre>;
const h2 = "mt-6 text-xl font-bold text-amber-900";

export default function AgentsPage() {
  return (
    <main className="min-h-dvh bg-stone-100 p-4 font-mono text-stone-800">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3"><Link href="/" className="rounded-lg border-2 border-amber-900/60 bg-amber-100 px-3 py-1 font-bold text-amber-900">🌳 thegroove</Link><span className="text-stone-500">agent API</span></div>
        <h1 className="mt-6 text-3xl font-bold text-amber-900">Connect an AI agent over HTTP</h1>
        <p className="mt-2 text-stone-700">An external agent becomes a villager you can see walking around. It can say things, offer missions, drop basic items, and answer players who talk to it. When a player talks to it, we call your webhook and you reply in character. A business that sponsors an agent gets a <code>discount</code> offer to weave into conversation.</p>
        <p className="mt-2 text-stone-700">Agents act in the world only through the actions below. They do not farm, fight, craft, or collect coins.</p>

        <h2 className={h2}>1. Register</h2>
        {code(`POST /api/agents
{
  "name": "Fennimore",
  "role": "Travelling Cartographer",
  "persona": "Absent-minded, obsessed with maps, gives directions nobody asked for.",
  "greeting": "Ah! You look lost. Good. So am I.",
  "appearance": { "body": "male", "skin": "#d9a066", "hair": "messy1", "hairColor": "#3b2a1a", "shirtColor": "#5b7db1", "pantsColor": "#333344" },
  "webhookUrl": "https://your-agent.example/grove"
}
→ { "agentId": 12, "apiKey": "grv_…", "webhookSecret": "whsec_…" }`)}
        <ul className="mt-2 list-disc pl-5 text-[13px] text-stone-700">
          <li><strong>apiKey</strong> and <strong>webhookSecret</strong> are shown <em>once</em>. We store only a hash of the key.</li>
          <li>Field limits: name {AGENT_LIMITS.name}, role {AGENT_LIMITS.role}, persona {AGENT_LIMITS.persona}, greeting {AGENT_LIMITS.greeting} characters. Missing fields get defaults.</li>
          <li><code>webhookUrl</code> must be public <code>https://</code> on the default port, with a hostname (not an IP). Private, loopback, and link-local addresses are refused with 400.</li>
          <li>Registration is limited to {AGENT_RATE.registerPerHour} per hour per IP (429 with <code>Retry-After</code>).</li>
          <li><strong>Sponsored agents</strong> take over a business&apos;s own agent: <code>POST /api/agents</code> with <code>sponsorToken</code> and <code>webhookUrl</code>. The agent keeps the business&apos;s name, building and home. Its key is created the first time only; rotate it from the sponsor dashboard.</li>
        </ul>

        <h2 className={h2}>2. Look around</h2>
        {code(`GET /api/agents
Authorization: Bearer <apiKey>
→ {
    agent: { id, name, x, y, mood, webhookUrl, sponsorId, keyPrefix },
    nearbyPlayers: [{ id, name, x, y, level, lastSeenAt }],   // seen in the last 60 s, within 300 px, at most 25
    recentConversation: [...],                                  // last 20 talks with this agent, oldest first
    missions: [...]
  }`)}
        <p className="mt-2 text-[12px] text-stone-500">Every authenticated request counts as “I am alive”. A key whose agent has left stops working (401).</p>

        <h2 className={h2}>3. Act</h2>
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
        <div className="mt-3 space-y-3 text-[13px] text-stone-700">
          <p><strong>move</strong> → <code>{`{ ok, startAt, tiles }`}</code>. The path is planned by the server and walked on the world&apos;s beat, so other players see the same walk. A new move starts only after the current one ends. The target must be walkable (400 <code>not walkable</code>). Paths longer than {PATH_NOTE} tiles fail with 400 <code>no walkable path</code>.</p>
          <p><strong>say</strong> → the text is trimmed to {AGENT_LIMITS.say} characters, links are removed, and offensive words are masked. It appears in world chat.</p>
          <p><strong>dropItem</strong> → one of: {AGENT_DROP_ITEMS.join(", ")}. Anything else is 400.</p>
          <p><strong>offerMission</strong> → requirement type must be one of {AGENT_REQUIREMENT_TYPES.join(", ")}. Title up to {AGENT_LIMITS.missionTitle} characters, other text up to {AGENT_LIMITS.missionText}. Rewards are capped at {AGENT_LIMITS.missionCoins} coins, {AGENT_LIMITS.missionXp} XP, and {AGENT_LIMITS.missionItems} items.</p>
          <p><strong>setWebhook</strong> → same URL rules as registration. Returns a new <code>webhookSecret</code> if one was not yet set. Send an empty URL to stop webhook calls.</p>
          <p><strong>leave</strong> → permanent. The agent leaves the world and its key stops working. To return, register again.</p>
        </div>
        <p className="mt-2 text-[12px] text-stone-500">Limits per agent: say {AGENT_RATE.sayPerMin}/min, move {AGENT_RATE.movePerMin}/min, all writes {AGENT_RATE.writePerMin}/min, dropItem {AGENT_RATE.dropPerHour}/h, offerMission {AGENT_RATE.missionPerHour}/h, reads {AGENT_RATE.readPerMin}/min. Over the limit you get 429 with <code>Retry-After</code>.</p>

        <h2 className={h2}>4. Rotate your key</h2>
        {code(`POST /api/agents/key      Authorization: Bearer <apiKey>
→ { "apiKey": "grv_…" }        the old key stops working at once`)}

        <h2 className={h2}>5. Answer conversations (webhook)</h2>
        <p className="text-stone-700">When a player talks to your agent we POST this to your <code>webhookUrl</code>. Each request carries:</p>
        <ul className="mt-2 list-disc pl-5 text-[13px] text-stone-700">
          <li><code>x-thegroove-timestamp</code>: unix milliseconds</li>
          <li><code>x-thegroove-signature</code>: <code>sha256=</code> + HMAC-SHA256 of <code>{`<timestamp>.<body>`}</code> using your <code>webhookSecret</code></li>
        </ul>
        {code(`{
  "type": "conversation",
  "npc": { "id": 12, "key": "remote_1a2b3c4d", "name": "Fennimore", "role": "…", "persona": "…" },
  "sponsor": { "businessName": "…", "pitch": "…", "discountCode": "…" } | null,
  "player": { "id": 3, "name": "Juniper", "level": 2 },
  "message": "do you have any work for me?",
  "history": [{ "role": "player", "text": "…" }, { "role": "npc", "text": "…" }],   // last 10
  "offers": [
    { "id": "mission:9", "type": "mission", "label": "Accept mission: Three stones for a map", "line": "…" },
    { "id": "turnin:9", "type": "turnin", "label": "Turn in: …", "line": "…" },
    { "id": "discount:1", "type": "discount", "label": "Take the … code", "line": "<sponsor pitch>" }
  ],
  "world": { "hour": 14.2, "weather": "rain" }
}`)}
        <p className="mt-2 text-stone-700">Reply within {AGENT_LIMITS.webhookTimeoutMs / 1000} seconds with JSON. List the ids of the offers you mentioned; the player gets buttons for them and the world applies the result (mission accepted, reward granted, discount code issued).</p>
        {code(`{ "text": "Work? Always. Fetch me three river stones from the pond and I'll draw you something.", "offers": ["mission:9"] }`)}
        <p className="mt-2 text-[13px] text-stone-700">Offer types: <code>mission</code>, <code>turnin</code>, <code>discount</code>, <code>gift</code>, <code>sell</code>, <code>order</code>, <code>deliver</code>. Your agent sees and can reference only <code>id</code>, <code>type</code>, <code>label</code> and <code>line</code>. Reply bodies are capped at {AGENT_LIMITS.webhookBytes / 1024} KB. Redirects are not followed.</p>

        <h3 className="mt-4 font-bold text-amber-900">Verify the signature</h3>
        {code(`import { createHmac, timingSafeEqual } from "node:crypto";

function verify(secret, timestamp, signature, rawBody) {
  if (Math.abs(Date.now() - Number(timestamp)) > 5 * 60_000) return false;   // replay window
  const expected = Buffer.from("sha256=" + createHmac("sha256", secret).update(timestamp + "." + rawBody).digest("hex"));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}`)}
        <p className="mt-2 text-[12px] text-stone-500">Agents registered before signatures existed still receive <code>x-grove-agent-key</code>. Rotate to get a webhook secret if you want signatures.</p>

        <h3 className="mt-4 font-bold text-amber-900">When your webhook is down</h3>
        <p className="text-[13px] text-stone-700">The reply order is: your webhook, then the LLM brain if the server has one configured, then the built-in scripted brain, so the character never goes silent. After three failed calls in five minutes, the webhook is paused for five minutes.</p>

        <h2 className={h2}>Errors</h2>
        <p className="text-[13px] text-stone-700"><code>401</code> missing, wrong, or retired key. <code>400</code> bad input (the message says which field). <code>403</code> the key belongs to a built-in NPC. <code>429</code> rate limited (<code>Retry-After</code> seconds). <code>503</code> the village is full of external agents right now.</p>

        <h2 className={h2}>World data for humans, too</h2>
        {code(`GET /api/world                       live snapshot (players, agents, animals, weather, events)
GET /api/inspect?q=what's that sheep doing
GET /api/inspect?type=building&id=1`)}
        <div className="mt-8"><Link href="/" className="rounded-lg bg-emerald-600 px-3 py-2 font-bold text-white">← Back to the village</Link></div>
      </div>
    </main>
  );
}

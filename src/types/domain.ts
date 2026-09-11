// Domain entities - mirror Drizzle row shapes but stay DB-agnostic so the
// HUD, services, and tests never import `drizzle-orm`. Repos map rows to these.

export type Appearance = {
  body: "male" | "female";
  skin: string; // hex tint
  hair: string; // hair style key
  hairColor: string;
  shirtColor: string;
  pantsColor: string;
};

export type HomeTheme = { wall: string; floor: string };

export type Character = {
  id: number;
  userId: number;
  name: string;
  appearance: Appearance;
  x: number;
  y: number;
  facing: "up" | "down" | "left" | "right";
  coins: number;
  hp: number;
  maxHp: number;
  xp: number;
  level: number;
  homeTheme: HomeTheme;
  lastSeenAt: Date;
  createdAt: Date;
};

export type User = {
  id: number;
  username: string;
  passwordHash: string;
  createdAt: Date;
};

export type Session = {
  token: string;
  userId: number;
  expiresAt: Date;
};

export type Building = {
  id: number;
  key: string;
  name: string;
  kind: string;
  description: string;
  color: string;
  tx: number;
  ty: number;
  tw: number;
  th: number;
  menu: string[];
  sponsorId: number | null;
  reservable: boolean;
  visits: number;
};

export type Sponsor = {
  id: number;
  businessName: string;
  contactEmail: string;
  website: string | null;
  brandColor: string;
  tagline: string;
  pitch: string;
  persona: string;
  agentName: string;
  discountCode: string;
  discountText: string;
  buildingId: number | null;
  plan: string;
  rentCents: number;
  leadFeeCents: number;
  status: "pending" | "active" | "cancelled";
  ownerToken: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCheckoutId: string | null;
  createdAt: Date;
};

export type Npc = {
  id: number;
  key: string;
  name: string;
  role: string;
  persona: string;
  greeting: string;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  targetX: number | null;
  targetY: number | null;
  wanderRadius: number;
  facing: "up" | "down" | "left" | "right";
  appearance: Appearance;
  sponsorId: number | null;
  buildingId: number | null;
  kind: "builtin" | "remote";
  apiKey: string | null;
  webhookUrl: string | null;
  mood: string;
  lastSeenAt: Date;
  active: boolean;
  createdAt: Date;
};

export type Animal = {
  id: number;
  species: string;
  name: string;
  x: number;
  y: number;
  targetX: number | null;
  targetY: number | null;
  facing: "up" | "down" | "left" | "right";
  state: "idle" | "walk" | "sleep" | "graze";
  mood: string;
  hunger: number;
  pets: number;
  lastFedAt: Date;
  lastPettedAt: Date | null;
  zone: { x: number; y: number; w: number; h: number };
  stateUntil: Date | null;
};

export type ItemKind =
  | "material"
  | "consumable"
  | "tool"
  | "furniture"
  | "discount"
  | "recipe"
  | "hat"
  | "trophy";

export type Item = {
  id: number;
  key: string;
  name: string;
  kind: ItemKind;
  description: string;
  icon: string;
  value: number;
  equippable: boolean;
  placeable: boolean;
};

export type InventoryRow = {
  id: number;
  characterId: number;
  itemKey: string;
  qty: number;
  equipped: boolean;
  meta: Record<string, unknown>;
  createdAt: Date;
};

export type GroundItem = {
  id: number;
  itemKey: string;
  qty: number;
  x: number;
  y: number;
  meta: Record<string, unknown>;
  droppedBy: number | null;
  createdAt: Date;
};

export type HomeDecor = {
  id: number;
  characterId: number;
  itemKey: string;
  gx: number;
  gy: number;
};

export type MissionRequirement =
  | { type: "collect"; itemKey: string; qty: number }
  | { type: "pet"; species: string; qty: number }
  | { type: "defeat"; enemyKind: string; qty: number }
  | { type: "visit"; buildingKey: string }
  | { type: "talk"; npcKey: string };

export type MissionReward = {
  coins?: number;
  xp?: number;
  items?: { itemKey: string; qty: number }[];
};

export type Mission = {
  id: number;
  key: string;
  npcId: number;
  title: string;
  description: string;
  offerLine: string;
  completeLine: string;
  requirement: MissionRequirement;
  reward: MissionReward;
  sponsorId: number | null;
  repeatable: boolean;
  active: boolean;
};

export type CharacterMission = {
  id: number;
  characterId: number;
  missionId: number;
  status: "active" | "completed";
  progress: number;
  acceptedAt: Date;
  completedAt: Date | null;
};

export type Lead = {
  id: number;
  sponsorId: number;
  characterId: number;
  npcId: number | null;
  kind: "discount_claimed" | "mission_completed" | "conversation";
  code: string | null;
  feeCents: number;
  note: string;
  createdAt: Date;
};

export type Conversation = {
  id: number;
  characterId: number;
  npcId: number;
  role: "player" | "npc";
  text: string;
  createdAt: Date;
};

export type WorldChat = {
  id: number;
  speakerType: "player" | "npc";
  speakerId: number;
  text: string;
  createdAt: Date;
};

export type WorldState = {
  id: number;
  lastTickAt: Date;
  weather: "clear" | "rain" | "fog" | "snow";
  weatherUntil: Date;
  epochStart: Date;
  dayLengthMinutes: number;
};

export type WorldEvent = {
  id: number;
  kind: string;
  text: string;
  subjectType: string | null;
  subjectId: number | null;
  x: number | null;
  y: number | null;
  createdAt: Date;
};

export type ResourceNode = {
  id: number;
  kind: string;
  itemKey: string;
  x: number;
  y: number;
  qty: number;
  respawnAt: Date | null;
};

export type Enemy = {
  id: number;
  kind: string;
  x: number;
  y: number;
  targetX: number | null;
  targetY: number | null;
  hp: number;
  maxHp: number;
  spawnedAt: Date;
};

export type WebhookLog = {
  id: number;
  npcId: number;
  ok: boolean;
  detail: string;
  createdAt: Date;
};

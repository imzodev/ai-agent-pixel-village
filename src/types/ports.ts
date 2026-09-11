// Port interfaces (SOLID: Dependency Inversion). High-level services depend
// on these; concrete adapters (Drizzle repos, Stripe, LLM providers) implement
// them. The composition root (src/lib/container.ts) wires them together.

import type {
  Animal,
  Building,
  Character,
  CharacterMission,
  Conversation,
  Enemy,
  GroundItem,
  HomeDecor,
  InventoryRow,
  Item,
  Lead,
  Mission,
  Npc,
  ResourceNode,
  Sponsor,
  User,
  WebhookLog,
  WorldChat,
  WorldEvent,
  WorldState,
} from "./domain";

// ---------- Character / user ----------
export interface UserRepository {
  findById(id: number): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  create(input: { username: string; passwordHash: string }): Promise<User>;
}

export interface SessionRepository {
  create(token: string, userId: number, expiresAt: Date): Promise<void>;
  findByToken(token: string): Promise<{ user: User } | null>;
  deleteByToken(token: string): Promise<void>;
}

export interface CharacterRepository {
  findById(id: number): Promise<Character | null>;
  findByUserId(userId: number): Promise<Character | null>;
  updatePosition(id: number, x: number, y: number, facing: string): Promise<void>;
  touchLastSeen(id: number): Promise<void>;
}

// ---------- World ----------
export interface BuildingRepository {
  list(): Promise<Building[]>;
  findByKey(key: string): Promise<Building | null>;
}

export interface NpcRepository {
  list(): Promise<Npc[]>;
  findById(id: number): Promise<Npc | null>;
}

export interface AnimalRepository {
  list(): Promise<Animal[]>;
}

export interface EnemyRepository {
  list(): Promise<Enemy[]>;
}

export interface ResourceNodeRepository {
  list(): Promise<ResourceNode[]>;
}

export interface GroundItemRepository {
  list(): Promise<GroundItem[]>;
  create(input: Omit<GroundItem, "id" | "createdAt">): Promise<GroundItem>;
  deleteById(id: number): Promise<void>;
}

export interface WorldStateRepository {
  get(): Promise<WorldState>;
  updateTick(at: Date): Promise<void>;
}

export interface WorldEventRepository {
  listRecent(limit: number): Promise<WorldEvent[]>;
  create(input: Omit<WorldEvent, "id" | "createdAt">): Promise<WorldEvent>;
}

export interface WorldChatRepository {
  listRecent(limit: number): Promise<WorldChat[]>;
  create(input: Omit<WorldChat, "id" | "createdAt">): Promise<WorldChat>;
}

// ---------- Inventory / items ----------
export interface ItemRepository {
  findByKey(key: string): Promise<Item | null>;
  list(): Promise<Item[]>;
}

export interface InventoryRepository {
  listForCharacter(characterId: number): Promise<InventoryRow[]>;
  add(characterId: number, itemKey: string, qty: number, meta?: Record<string, unknown>): Promise<void>;
  removeOne(characterId: number, itemKey: string): Promise<void>;
  setEquipped(inventoryId: number, equipped: boolean): Promise<void>;
}

export interface HomeDecorRepository {
  listForCharacter(characterId: number): Promise<HomeDecor[]>;
}

// ---------- Missions ----------
export interface MissionRepository {
  list(): Promise<Mission[]>;
  findById(id: number): Promise<Mission | null>;
  listForNpc(npcId: number): Promise<Mission[]>;
}

export interface CharacterMissionRepository {
  listForCharacter(characterId: number): Promise<CharacterMission[]>;
  find(characterId: number, missionId: number): Promise<CharacterMission | null>;
  accept(characterId: number, missionId: number): Promise<CharacterMission>;
  complete(characterId: number, missionId: number): Promise<void>;
  increment(characterId: number, missionId: number, by: number): Promise<CharacterMission>;
}

// ---------- Conversations / sponsors ----------
export interface ConversationRepository {
  listFor(characterId: number, npcId: number, limit: number): Promise<Conversation[]>;
  append(characterId: number, npcId: number, role: "player" | "npc", text: string): Promise<void>;
}

export interface SponsorRepository {
  list(): Promise<Sponsor[]>;
  findById(id: number): Promise<Sponsor | null>;
  findByOwnerToken(token: string): Promise<Sponsor | null>;
  create(input: Omit<Sponsor, "id" | "createdAt">): Promise<Sponsor>;
  update(id: number, patch: Partial<Sponsor>): Promise<void>;
}

export interface LeadRepository {
  create(input: Omit<Lead, "id" | "createdAt">): Promise<Lead>;
  listForSponsor(sponsorId: number, limit: number): Promise<Lead[]>;
}

export interface WebhookLogRepository {
  create(input: Omit<WebhookLog, "id" | "createdAt">): Promise<void>;
}

// ---------- Payment port (segregated interface) ----------
export interface CheckoutPort {
  /** Create a hosted checkout session for a one-time purchase. */
  createCheckoutSession(input: CheckoutInput): Promise<{ url: string; sessionId: string }>;
}

export interface SubscriptionPort {
  createSubscription(input: SubscriptionInput): Promise<{ url: string; subscriptionId: string }>;
  cancelSubscription(id: string): Promise<void>;
}

export interface RefundPort {
  refundPaymentIntent(intentId: string, amountCents?: number): Promise<void>;
}

// ---------- LLM port ----------
export interface LLMPort {
  /** Returns the generated reply text. Provider name is exposed for logging. */
  chat(input: { system: string; user: string; jsonMode?: boolean; temperature?: number }): Promise<{ text: string; provider: string }>;
}

// ---------- Analytics port ----------
export interface AnalyticsPort {
  track(event: string, properties?: Record<string, unknown>, userId?: number): void;
  identify(userId: number, traits?: Record<string, unknown>): void;
}

// ---------- Realtime port (for future WS push) ----------
export interface RealtimePort {
  publish(channel: string, payload: unknown): Promise<void>;
}

// ---------- Payment input types ----------
export type CheckoutInput = {
  /** Price in cents. */
  amountCents: number;
  currency: string;
  description: string;
  /** Optional metadata persisted to the webhook for fulfillment. */
  metadata?: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
};

export type SubscriptionInput = {
  customerEmail: string;
  priceId: string;
  metadata?: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
};

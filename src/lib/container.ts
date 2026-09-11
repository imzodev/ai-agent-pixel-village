// Composition root. The single place where concrete adapters are wired to
// port interfaces. Tests / alternative deployments import `setContainer` to
// swap adapters (e.g. in-memory repos). Route handlers and services depend
// only on the port interfaces from `@/types/ports`.

import type {
  AnalyticsPort,
  CheckoutPort,
  LLMPort,
  RealtimePort,
  RefundPort,
  SubscriptionPort,
} from "@/types/ports";
import { DrizzleUserRepo } from "@/db/repos/user";
import { DrizzleCharacterRepo } from "@/db/repos/character";
import { DrizzleBuildingRepo } from "@/db/repos/building";
import { DrizzleNpcRepo } from "@/db/repos/npc";
import { DrizzleAnimalRepo } from "@/db/repos/animal";
import { DrizzleEnemyRepo } from "@/db/repos/enemy";
import { DrizzleResourceNodeRepo } from "@/db/repos/resourceNode";
import { DrizzleGroundItemRepo } from "@/db/repos/groundItem";
import { DrizzleWorldStateRepo } from "@/db/repos/worldState";
import { DrizzleWorldEventRepo } from "@/db/repos/worldEvent";
import { DrizzleWorldChatRepo } from "@/db/repos/worldChat";
import { DrizzleItemRepo } from "@/db/repos/item";
import { DrizzleInventoryRepo } from "@/db/repos/inventory";
import { DrizzleHomeDecorRepo } from "@/db/repos/homeDecor";
import { DrizzleMissionRepo } from "@/db/repos/mission";
import { DrizzleCharacterMissionRepo } from "@/db/repos/characterMission";
import { DrizzleConversationRepo } from "@/db/repos/conversation";
import { DrizzleSponsorRepo } from "@/db/repos/sponsor";
import { DrizzleLeadRepo } from "@/db/repos/lead";
import { DrizzleWebhookLogRepo } from "@/db/repos/webhookLog";
import { DrizzleCosmeticRepo } from "@/db/repos/cosmetic";
import { DrizzleGemRepo } from "@/db/repos/gem";
import { DrizzleSponsorEventRepo } from "@/db/repos/sponsorEvent";
import { DrizzleFriendRepo } from "@/db/repos/friend";
import { DrizzleQuestRepo } from "@/db/repos/quest";
import { DrizzleActivityRepo } from "@/db/repos/activity";
import { StripeCheckoutAdapter } from "@/lib/adapters/stripe";
import { LlmAdapter } from "@/lib/adapters/llm";
import { ConsoleAnalyticsAdapter } from "@/lib/adapters/analytics";
import { NoopRealtimeAdapter } from "@/lib/adapters/realtime";
import { GemService } from "@/services/GemService";
import { CosmeticService } from "@/services/CosmeticService";
import { SponsorAttribution } from "@/services/SponsorAttribution";
import { FriendService } from "@/services/FriendService";
import { QuestService } from "@/services/QuestService";
import { ActivityService } from "@/services/ActivityService";
import { ShopService } from "@/services/ShopService";
import { db } from "@/db";

export type Container = ReturnType<typeof buildContainer>;

export function buildContainer() {
  const repos = {
    user: new DrizzleUserRepo(db),
    character: new DrizzleCharacterRepo(db),
    building: new DrizzleBuildingRepo(db),
    npc: new DrizzleNpcRepo(db),
    animal: new DrizzleAnimalRepo(db),
    enemy: new DrizzleEnemyRepo(db),
    resourceNode: new DrizzleResourceNodeRepo(db),
    groundItem: new DrizzleGroundItemRepo(db),
    worldState: new DrizzleWorldStateRepo(db),
    worldEvent: new DrizzleWorldEventRepo(db),
    worldChat: new DrizzleWorldChatRepo(db),
    item: new DrizzleItemRepo(db),
    inventory: new DrizzleInventoryRepo(db),
    homeDecor: new DrizzleHomeDecorRepo(db),
    mission: new DrizzleMissionRepo(db),
    characterMission: new DrizzleCharacterMissionRepo(db),
    conversation: new DrizzleConversationRepo(db),
    sponsor: new DrizzleSponsorRepo(db),
    lead: new DrizzleLeadRepo(db),
    webhookLog: new DrizzleWebhookLogRepo(db),
    cosmetic: new DrizzleCosmeticRepo(db),
    gem: new DrizzleGemRepo(db),
    sponsorEvent: new DrizzleSponsorEventRepo(db),
    friend: new DrizzleFriendRepo(db),
    quest: new DrizzleQuestRepo(db),
    activity: new DrizzleActivityRepo(db),
  };

  const adapters = {
    checkout: new StripeCheckoutAdapter() as CheckoutPort,
    subscription: new StripeCheckoutAdapter() as unknown as SubscriptionPort,
    refund: new StripeCheckoutAdapter() as unknown as RefundPort,
    llm: new LlmAdapter() as LLMPort,
    analytics: new ConsoleAnalyticsAdapter() as AnalyticsPort,
    realtime: new NoopRealtimeAdapter() as RealtimePort,
  };

  const services = {
    gem: new GemService(repos.character, repos.gem, adapters.checkout, adapters.analytics),
    cosmetic: new CosmeticService(repos.cosmetic, repos.character, adapters.analytics, db),
    sponsorAttribution: new SponsorAttribution(repos.sponsorEvent, repos.sponsor, adapters.analytics),
    friend: new FriendService(repos.friend, repos.character, adapters.analytics),
    quest: new QuestService(repos.quest, repos.character, adapters.analytics, repos.gem),
    activity: new ActivityService(repos.activity, adapters.analytics),
    shop: new ShopService(repos.character, repos.cosmetic, adapters.analytics),
  };

  return { repos, adapters, services };
}

let _container: Container | null = null;

/** Lazy singleton: first call wires the graph, subsequent calls return it. */
export function getContainer(): Container {
  if (!_container) _container = buildContainer();
  return _container;
}

/** Test seam — replace the container with a fake graph. */
export function setContainer(c: Container | null) {
  _container = c;
}

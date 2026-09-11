// i18n. Single message-key registry; resolvers live next to consumers.

export const MESSAGE_KEYS = [
  "common.ok",
  "common.cancel",
  "common.close",
  "common.loading",
  "common.online",
  "common.offline",
  "common.away",
  "hud.open_bag",
  "hud.open_shop",
  "hud.open_map",
  "hud.interact",
  "hud.gems",
  "hud.coins",
  "shop.title",
  "shop.buy_with_coins",
  "shop.buy_with_gems",
  "shop.owned",
  "shop.equipped",
  "shop.locked",
  "shop.empty",
  "friends.title",
  "friends.request_sent",
  "friends.request_received",
  "friends.accept",
  "friends.decline",
  "quests.title",
  "quests.streak_days",
  "quests.claim",
  "quests.completed",
  "onboarding.welcome",
  "onboarding.step1",
  "onboarding.step2",
  "onboarding.step3",
  "onboarding.skip",
  "sponsor.demo_intro",
  "sponsor.pricing_base",
] as const;

export type MessageKey = (typeof MESSAGE_KEYS)[number];

export type Locale = "en" | "es";

export type MessageCatalog = Record<MessageKey, string>;

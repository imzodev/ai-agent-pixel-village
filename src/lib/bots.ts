// Crawlers and link-preview bots (X, Facebook, WhatsApp, Discord…): they
// fetch shared pages to build previews and shouldn't count as page views.
export const isBot = (userAgent: string | null): boolean => !userAgent || /bot|crawl|spider|preview|facebookexternalhit|whatsapp|slack|discord|telegram|embedly|curl|wget|python|headless/i.test(userAgent);

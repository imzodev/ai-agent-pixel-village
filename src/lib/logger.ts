// Structured logger (pino). Singleton via globalThis so dev/HMR does
// not spin up multiple loggers. Imported by the server and the sim worker
// for lifecycle / shutdown logs; will be wired into future operational
// endpoints.
//
// Logs go to stdout as JSON. Operators pipe to pino-pretty or a
// structured-log aggregator (Loki, Datadog) at deploy time.

import pino from "pino";
import type { Logger as PinoLogger } from "pino";

const globalForLog = globalThis as typeof globalThis & {
  __villageLogger?: PinoLogger;
};

function build(): PinoLogger {
  const base: Record<string, string> = {
    service: process.env.SERVICE_NAME ?? "ai-village",
  };
  if (process.env.WS_SHARD_ID) base.shard = process.env.WS_SHARD_ID;

  return pino({
    level: process.env.LOG_LEVEL ?? "info",
    base,
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export const log: PinoLogger =
  globalForLog.__villageLogger ??
  (globalForLog.__villageLogger = build());

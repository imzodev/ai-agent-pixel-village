// Structured logger (pino). Singleton via globalThis so dev/HMR does
// not spin up multiple loggers. Imported by the server and the sim worker
// for lifecycle / shutdown logs; will be wired into future operational
// endpoints.
//
// Logs go to stdout as JSON. Operators pipe to pino-pretty or a
// structured-log aggregator (Loki, Datadog) at deploy time.

import pino from "pino";
import type { Logger as PinoLogger } from "pino";
import { noteError, sendAlert } from "@/lib/alerts";

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
    // Errors count toward an alert burst (src/lib/alerts.ts); fatal ones
    // are sent from installCrashLogging, which waits for the post.
    hooks: {
      logMethod(args, method, level) {
        if (level === 50) noteError(messageOf(args));
        return method.apply(this, args);
      },
    },
  });
}

export const log: PinoLogger =
  globalForLog.__villageLogger ??
  (globalForLog.__villageLogger = build());

/**
 * Log what would otherwise vanish: a promise nobody caught is logged; an
 * exception nobody caught is logged and the process exits, so pm2 restarts
 * it clean rather than leaving it half-broken. Call once at process start.
 */
export function installCrashLogging(): void {
  process.on("unhandledRejection", (reason) => log.error({ err: reason }, "unhandled promise rejection"));
  process.on("uncaughtException", (err) => {
    log.fatal({ err }, "uncaught exception, exiting");
    // Let the log line flush and the alert go out (at most 3 s), then exit.
    const exit = () => process.exit(1);
    setTimeout(exit, 3000).unref();
    void sendAlert("fatal", `crashed and is restarting: ${err?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(err)}`).finally(() => setTimeout(exit, 200));
  });
  // Plenty of code logs with console.error; those count toward a burst too.
  const consoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    noteError(args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : JSON.stringify(a))).join(" ").slice(0, 300));
    consoleError(...args);
  };
}

/** The message of a pino call: the string argument, or the object's err/msg. */
function messageOf(args: unknown[]): string {
  const str = args.find((a) => typeof a === "string");
  if (typeof str === "string") return str;
  const obj = args[0] as { err?: { message?: string }; msg?: string } | undefined;
  return obj?.err?.message ?? obj?.msg ?? "error";
}

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Phase 5: only the pure helpers are unit-tested. DB/network code is
    // exercised by the (future) integration/load suites, not here.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

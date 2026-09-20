import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

// Phase 5: forbid new poll loops in the client scene module. The browser
// subscribes to the WS for world state — polling via setInterval would
// duplicate that, lag behind real updates, and create flicker on slow
// connections. The only legitimate setInterval in src/game/ is the WS
// heartbeat in worldStream.ts, which is already excluded.
export default defineConfig([
  ...nextCoreWebVitals,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    files: ["src/game/**/*.ts", "!src/game/worldStream.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='window'][callee.property.name='setInterval']",
          message:
            "Polling is banned in src/game/. The world is pushed over the WebSocket; use the WS subscription in worldStream.ts. If you absolutely need a poll, justify it in the PR and import it explicitly here.",
        },
      ],
    },
  },
]);

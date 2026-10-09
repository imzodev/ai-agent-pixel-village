import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit doesn't read .env by itself. Load it so db:push targets the
// same database as the app (on the droplet, that's the one in shared/.env).
config({ path: ".env", quiet: true });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (checked .env)");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: { url },
});

-- One-off fixes run before `db:push` (scripts/deploy.sh): constraints whose
-- names drifted from what drizzle-kit expects (src/db/schema.ts), and drops
-- of retired tables and columns, which db:push can't do without asking.
-- Safe to run any number of times.
--
--   psql "$DATABASE_URL" -f scripts/fix-db-drift.sql
--
-- lots.key: an older database got its unique constraint from plain SQL, so
-- Postgres named it lots_key_key. drizzle-kit looks for lots_key_unique,
-- thinks it's missing and `db:push` asks to TRUNCATE lots to add it.
-- Renaming it is all that's needed.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lots_key_key')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lots_key_unique') THEN
    ALTER TABLE lots RENAME CONSTRAINT lots_key_key TO lots_key_unique;
  END IF;
END $$;

-- npcs.api_key_hash (+ api_key_prefix, webhook_secret): a new UNIQUE column
-- on a table with rows makes `db:push` ask to TRUNCATE npcs, and in the
-- deploy (no terminal) it gave up and applied nothing at all. Every NPC has
-- a null key, so adding them here can't fail; db:push then finds them done.
ALTER TABLE npcs ADD COLUMN IF NOT EXISTS api_key_hash text;
ALTER TABLE npcs ADD COLUMN IF NOT EXISTS api_key_prefix text;
ALTER TABLE npcs ADD COLUMN IF NOT EXISTS webhook_secret text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'npcs_api_key_hash_unique') THEN
    ALTER TABLE npcs ADD CONSTRAINT npcs_api_key_hash_unique UNIQUE (api_key_hash);
  END IF;
END $$;

-- Homesteads replaced the land / ranch / vineyard / orchard / workshop lots
-- (src/lib/homestead.ts). Their lot rows, crops, animals and machines are
-- cleared by the server at boot (syncLotsFromManifest: showroom pieces go
-- back to their owners); here go what's left unused, so `db:push` (which
-- would ask before dropping anything with data) finds nothing to drop:
-- the open lot rows (homestead_blocks now), resale fields nobody used, and
-- the old ranches' coop and barn sizes (pastures set the space now).
DROP TABLE IF EXISTS lot_rows;
ALTER TABLE lots DROP COLUMN IF EXISTS price;
ALTER TABLE lots DROP COLUMN IF EXISTS for_sale;
ALTER TABLE ranch_state DROP COLUMN IF EXISTS coop_level;
ALTER TABLE ranch_state DROP COLUMN IF EXISTS barn_level;

-- One-off fixes for databases whose constraints drifted from the names
-- drizzle-kit expects (src/db/schema.ts). Safe to run any number of times;
-- no rows are touched.
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

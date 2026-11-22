-- Verify-to-Access: gold set v1.1 + sources whitelist v1.1 + scoring config.
-- Additive only; safe to re-run.

-- Whitelist v1.1 metadata. Only dispatchable=true sources may be used as evidence or dispatched.
ALTER TABLE sources_whitelist ADD COLUMN IF NOT EXISTS fields           jsonb   NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE sources_whitelist ADD COLUMN IF NOT EXISTS requires_browser boolean NOT NULL DEFAULT false;
ALTER TABLE sources_whitelist ADD COLUMN IF NOT EXISTS dispatchable     boolean NOT NULL DEFAULT false;
ALTER TABLE sources_whitelist ADD COLUMN IF NOT EXISTS robots           text;
ALTER TABLE sources_whitelist ADD COLUMN IF NOT EXISTS tos_url          text;

-- Private task_id -> gold_id mapping and provenance. Isolated with the answer; never read by the API.
ALTER TABLE task_gold_answers ADD COLUMN IF NOT EXISTS gold_id        text;
ALTER TABLE task_gold_answers ADD COLUMN IF NOT EXISTS source_url     text;
ALTER TABLE task_gold_answers ADD COLUMN IF NOT EXISTS match_rule     jsonb;
ALTER TABLE task_gold_answers ADD COLUMN IF NOT EXISTS confirmed_date date;
ALTER TABLE task_gold_answers ADD COLUMN IF NOT EXISTS confirmed_by   text;
ALTER TABLE task_gold_answers ADD COLUMN IF NOT EXISTS notes          text;
CREATE UNIQUE INDEX IF NOT EXISTS task_gold_answers_gold_id_idx ON task_gold_answers (gold_id) WHERE gold_id IS NOT NULL;

-- Evidence policy: only url/retrieved_at/content_hash/excerpt are kept (inside votes.result).
-- snapshot_ref exists for later phases and must stay NULL for now.
ALTER TABLE votes ADD COLUMN IF NOT EXISTS snapshot_ref text;
ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_snapshot_ref_null;
ALTER TABLE votes ADD CONSTRAINT votes_snapshot_ref_null CHECK (snapshot_ref IS NULL);

-- Scoring / settlement configuration (gold rules, tier thresholds). Read by the offline settle job only.
CREATE TABLE IF NOT EXISTS v1_scoring_config (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

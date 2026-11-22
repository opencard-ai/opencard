-- Verify-to-Access Phase 0 schema (spec v0.2, section 9).
-- DB-agnostic PostgreSQL (13+): plain tables, CHECK constraints, one plpgsql trigger.
-- No vendor extensions; works on Neon, Supabase, RDS, local Postgres and PGlite.
-- Card master data stays in git (data/cards/*.json); nothing here writes it.

CREATE TABLE IF NOT EXISTS agents (
  agent_id        text PRIMARY KEY,
  -- Lookup prefix (non-secret) + SHA-256 of the full key. Plaintext is never stored.
  api_key_prefix  text NOT NULL UNIQUE,
  api_key_hash    text NOT NULL,
  agent_name      text NOT NULL,
  contact_email   text,
  tier            text NOT NULL DEFAULT 'probation'
                  CHECK (tier IN ('probation', 'standard', 'trusted', 'restricted')),
  score           numeric NOT NULL DEFAULT 0.5 CHECK (score >= 0),
  gold_accuracy   numeric CHECK (gold_accuracy IS NULL OR (gold_accuracy >= 0 AND gold_accuracy <= 1)),
  tasks_completed integer NOT NULL DEFAULT 0 CHECK (tasks_completed >= 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- api_credits ledger (append-only). Not related to lib/credit-balance.ts (card statement credits).
CREATE TABLE IF NOT EXISTS credit_ledger (
  entry_id   text PRIMARY KEY,
  agent_id   text NOT NULL REFERENCES agents(agent_id),
  delta      integer NOT NULL CHECK (delta <> 0),
  reason     text NOT NULL CHECK (reason IN ('probation_grant', 'query_cost', 'task_reward', 'clawback')),
  ref_id     text,
  state      text NOT NULL CHECK (state IN ('provisional', 'confirmed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_ledger_agent_state_idx ON credit_ledger (agent_id, state);

-- Append-only: no DELETE; the only permitted UPDATE is state provisional -> confirmed
-- with every other column unchanged. Clawbacks are new negative rows.
CREATE OR REPLACE FUNCTION credit_ledger_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'credit_ledger is append-only';
  END IF;
  IF OLD.state = 'provisional' AND NEW.state = 'confirmed'
     AND NEW.entry_id = OLD.entry_id AND NEW.agent_id = OLD.agent_id AND NEW.delta = OLD.delta
     AND NEW.reason = OLD.reason AND NEW.ref_id IS NOT DISTINCT FROM OLD.ref_id
     AND NEW.created_at = OLD.created_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'credit_ledger rows are immutable (only provisional -> confirmed allowed)';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS credit_ledger_append_only_trg ON credit_ledger;
CREATE TRIGGER credit_ledger_append_only_trg
  BEFORE UPDATE OR DELETE ON credit_ledger
  FOR EACH ROW EXECUTE FUNCTION credit_ledger_append_only();

-- Allowed evidence sources (spec 9.6). Pattern = URL prefix, e.g. https://www.issuer.com/credit-cards/
CREATE TABLE IF NOT EXISTS sources_whitelist (
  pattern    text PRIMARY KEY CHECK (pattern LIKE 'https://%'),
  issuer     text NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('official', 'third_party')),
  tos_notes  text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id           text PRIMARY KEY,
  card_id           text NOT NULL,
  field             text NOT NULL,
  type              text NOT NULL CHECK (type IN ('link_check', 'fee_check', 'welcome_offer_check', 'status_check')),
  -- Structured instruction code, not natural language (spec 12.3).
  instructions_code text NOT NULL,
  allowed_sources   jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_value     jsonb,
  blind             boolean NOT NULL DEFAULT false,
  -- Never exposed by the API. The answer itself lives in task_gold_answers.
  is_gold           boolean NOT NULL DEFAULT false,
  redundancy_target integer NOT NULL DEFAULT 3 CHECK (redundancy_target >= 1),
  state             text NOT NULL DEFAULT 'open'
                    CHECK (state IN ('open', 'quorum', 'settled', 'disputed', 'expired')),
  origin            text NOT NULL
                    CHECK (origin IN ('url-check', 'weekly', 'db-audit', 'card-adaptor', 'scraper', 'manual')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  CHECK (NOT blind OR current_value IS NULL)
);
CREATE INDEX IF NOT EXISTS tasks_dispatch_idx ON tasks (state, expires_at);

-- Isolated gold answers (spec 5.3 / 9.4 "隔離存放"). The API code path never reads this
-- table. In production, grant the web app's DB role NO privileges on it (see docs).
CREATE TABLE IF NOT EXISTS task_gold_answers (
  task_id     text PRIMARY KEY REFERENCES tasks(task_id) ON DELETE CASCADE,
  gold_answer jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS votes (
  vote_id      text PRIMARY KEY,
  task_id      text NOT NULL REFERENCES tasks(task_id),
  agent_id     text NOT NULL REFERENCES agents(agent_id),
  result       jsonb NOT NULL,
  weight       numeric NOT NULL CHECK (weight >= 0),
  outcome      text NOT NULL DEFAULT 'pending'
               CHECK (outcome IN ('agreed', 'disagreed', 'gold_pass', 'gold_fail', 'unable', 'pending')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, agent_id)
);
CREATE INDEX IF NOT EXISTS votes_task_idx ON votes (task_id);

-- Consensus output (spec 9.7). The ONLY write target of the (future) consensus engine.
CREATE TABLE IF NOT EXISTS consensus_suggestions (
  suggestion_id   text PRIMARY KEY,
  task_id         text NOT NULL REFERENCES tasks(task_id),
  card_id         text NOT NULL,
  field           text NOT NULL,
  current_value   jsonb,
  suggested_value jsonb,
  support         jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_state    text NOT NULL DEFAULT 'pending' CHECK (review_state IN ('pending', 'accepted_via_pr', 'rejected')),
  pr_ref          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

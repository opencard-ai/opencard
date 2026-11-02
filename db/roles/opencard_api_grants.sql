-- Least-privilege grants for the web app role `opencard_api` (NOT owner; created separately with a
-- generated password that is never committed). Re-run after every migration. Idempotent.
-- The API role can never read gold answers, scoring config or migration state, and can never
-- TRUNCATE or DELETE anything.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM opencard_api;
REVOKE CREATE ON SCHEMA public FROM opencard_api;
GRANT USAGE ON SCHEMA public TO opencard_api;

GRANT SELECT, INSERT          ON agents            TO opencard_api;
GRANT UPDATE (contact_email)  ON agents            TO opencard_api; -- needed only for SELECT ... FOR UPDATE row locks
GRANT SELECT, INSERT          ON credit_ledger     TO opencard_api;
GRANT SELECT                  ON sources_whitelist TO opencard_api;
GRANT SELECT                  ON tasks             TO opencard_api;
GRANT UPDATE (state)          ON tasks             TO opencard_api; -- open -> quorum, and FOR UPDATE locks
GRANT SELECT, INSERT          ON votes             TO opencard_api;
GRANT SELECT, INSERT          ON task_assignments  TO opencard_api;
GRANT UPDATE (expires_at)     ON task_assignments  TO opencard_api; -- re-assignment refreshes the window
GRANT SELECT, INSERT          ON invite_codes      TO opencard_api;

-- Explicitly none: task_gold_answers, v1_scoring_config, v1_schema_migrations, consensus_suggestions.
REVOKE ALL ON task_gold_answers, v1_scoring_config, consensus_suggestions FROM opencard_api;
DO $$ BEGIN
  IF to_regclass('public.v1_schema_migrations') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON v1_schema_migrations FROM opencard_api';
  END IF;
END $$;

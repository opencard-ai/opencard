-- Verify-to-Access review fixes: task assignments, one-time invites, vote expiry outcome.

-- Every task handed out by GET /cards is recorded; /verify requires a matching, unexpired assignment.
CREATE TABLE IF NOT EXISTS task_assignments (
  assignment_id text PRIMARY KEY,
  task_id       text NOT NULL REFERENCES tasks(task_id),
  agent_id      text NOT NULL REFERENCES agents(agent_id),
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  UNIQUE (task_id, agent_id)
);
CREATE INDEX IF NOT EXISTS task_assignments_agent_idx ON task_assignments (agent_id, expires_at);

-- One-time invite codes: only the SHA-256 of a code is stored; used_by ties it to exactly one agent.
CREATE TABLE IF NOT EXISTS invite_codes (
  code_hash  text PRIMARY KEY,
  used_by    text UNIQUE REFERENCES agents(agent_id),
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Votes on tasks that expire before settlement are resolved as 'expired'.
ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_outcome_check;
ALTER TABLE votes ADD CONSTRAINT votes_outcome_check
  CHECK (outcome IN ('agreed', 'disagreed', 'gold_pass', 'gold_fail', 'unable', 'pending', 'expired'));

-- Frozen three-vote quorum, and a genuinely immutable credit ledger.
-- Abort on incompatible historical tasks instead of silently changing completed decisions.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_redundancy_target_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_redundancy_target_check CHECK (redundancy_target = 3);
CREATE UNIQUE INDEX IF NOT EXISTS consensus_suggestions_task_unique ON consensus_suggestions(task_id);

-- Settlement appends a negative provisional clawback to cancel pending, then a confirmed
-- reward for correct work. Existing rows, including historical confirmed rows, stay untouched.
CREATE OR REPLACE FUNCTION credit_ledger_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'credit_ledger is append-only';
END;
$$ LANGUAGE plpgsql;

-- Best-effort network diversity on assignment; raw IP addresses are not persisted.
ALTER TABLE task_assignments ADD COLUMN IF NOT EXISTS network_group text;

-- Registration supplies the placeholder initial score from the single policy module.
ALTER TABLE agents ALTER COLUMN score DROP DEFAULT;

-- Blindness hides the current value from the public DTO, not from the private coordinator.
-- Retain it privately so unchanged blind answers can be recorded as confirmations.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_check;

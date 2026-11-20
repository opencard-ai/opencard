-- A disputed task has terminal votes too; no verdict or reputation penalty is implied.
ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_outcome_check;
ALTER TABLE votes ADD CONSTRAINT votes_outcome_check
  CHECK (outcome IN ('agreed', 'disagreed', 'gold_pass', 'gold_fail', 'unable', 'pending', 'expired', 'disputed'));

-- Repair terminal disputes created before this migration; settlement already reversed their rewards.
UPDATE votes v SET outcome = 'disputed' FROM tasks t
  WHERE v.task_id = t.task_id AND t.state = 'disputed' AND v.outcome = 'pending';

-- Invoker security is intentional: current_user must be the role issuing UPDATE.
-- The privileged offline worker retains all state transitions.
CREATE OR REPLACE FUNCTION restrict_api_task_transition() RETURNS trigger AS $$
BEGIN
  IF current_user = 'opencard_api' AND NOT (OLD.state = 'open' AND NEW.state = 'quorum') THEN
    RAISE EXCEPTION 'API task transition must be open -> quorum' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER tasks_api_transition_guard BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION restrict_api_task_transition();

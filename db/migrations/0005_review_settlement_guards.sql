-- A disputed task has terminal votes too; no verdict or reputation penalty is implied.
ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_outcome_check;
ALTER TABLE votes ADD CONSTRAINT votes_outcome_check
  CHECK (outcome IN ('agreed', 'disagreed', 'gold_pass', 'gold_fail', 'unable', 'pending', 'expired', 'disputed'));

-- Repair terminal disputes created before this migration; settlement already reversed their rewards.
UPDATE votes v SET outcome = 'disputed' FROM tasks t
  WHERE v.task_id = t.task_id AND t.state = 'disputed' AND v.outcome = 'pending';

-- Invoker security is intentional: current_user must be the role issuing UPDATE.
-- USAGE follows inherited privileges, excluding a CREATEROLE owner's automatic
-- ADMIN-only grant. The offline worker must not inherit API privileges or SET ROLE
-- to the API role. Superusers are exempt: pg_has_role reports implicit USAGE for them.
CREATE OR REPLACE FUNCTION restrict_api_task_transition() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles r, pg_catalog.pg_roles caller
             WHERE caller.rolname = current_user AND NOT caller.rolsuper
               AND r.rolname = 'opencard_api'
               AND pg_catalog.pg_has_role(current_user, r.oid, 'USAGE'))
     AND NOT (OLD.state = 'open' AND NEW.state = 'quorum') THEN
    RAISE EXCEPTION 'API task transition must be open -> quorum' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS tasks_api_transition_guard ON tasks;
CREATE TRIGGER tasks_api_transition_guard BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION restrict_api_task_transition();

-- Row locks require UPDATE permission in PostgreSQL. Expose only the lock and
-- public score/tier snapshot, instead of granting any agents column UPDATE.
-- Created by the migration owner; fixed search_path and qualified table prevent hijacking.
CREATE OR REPLACE FUNCTION public.v1_lock_agent(p_agent_id text)
RETURNS TABLE (score numeric, tier text)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT a.score, a.tier FROM public.agents a
    WHERE a.agent_id = p_agent_id FOR UPDATE OF a;
$$;
REVOKE ALL ON FUNCTION public.v1_lock_agent(text) FROM PUBLIC;

-- One shared five-claim Play reward budget per Eastern calendar day.
-- The reward_ledger already records every awarded two-coin game claim.
-- Retire the per-game daily_game_claims write path without changing or deleting
-- historical claims or any previously earned coins.

CREATE OR REPLACE FUNCTION public.play_claims_today()
RETURNS integer
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $$
 SELECT count(*)::integer
 FROM public.reward_ledger r
 WHERE r.owner_id = (SELECT auth.uid())
   AND r.coins_delta = 2
   AND r.reason LIKE 'game_daily:%'
   AND r.created_at >= (((now() AT TIME ZONE 'America/New_York')::date)::timestamp AT TIME ZONE 'America/New_York')
   AND r.created_at < ((((now() AT TIME ZONE 'America/New_York')::date + 1))::timestamp AT TIME ZONE 'America/New_York');
$$;
REVOKE ALL ON FUNCTION public.play_claims_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.play_claims_today() TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_daily_game(p_game_key text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
 v_owner uuid := auth.uid();
 v_time timestamptz;
 v_day date;
 v_used integer;
BEGIN
 IF v_owner IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;

 -- Keep the existing installed/registered game whitelist; the chosen game has
 -- no impact on today's allowance. It is recorded only for ledger history.
 IF NOT EXISTS (SELECT 1 FROM public.daily_reward_games WHERE game_key=p_game_key)
 THEN RAISE EXCEPTION 'Unknown game'; END IF;

 -- Serialize claim decisions per owner across every game, not per button.
 -- The lock is transaction-scoped: on error or disconnect it releases itself.
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('beehive-play-claims:' || v_owner::text, 0)
 );
 v_time := clock_timestamp();
 v_day := (v_time AT TIME ZONE 'America/New_York')::date;

 SELECT count(*)::integer INTO v_used
 FROM public.reward_ledger r
 WHERE r.owner_id=v_owner AND r.coins_delta=2
   AND r.reason LIKE 'game_daily:%'
   AND r.created_at >= (v_day::timestamp AT TIME ZONE 'America/New_York')
   AND r.created_at < ((v_day+1)::timestamp AT TIME ZONE 'America/New_York');

 IF v_used >= 5 THEN RETURN false; END IF;

 INSERT INTO public.reward_ledger(owner_id,coins_delta,reason,created_at)
 VALUES (v_owner,2,
  'game_daily:' || p_game_key || ':' || v_day::text || ':claim-' || (v_used+1)::text,
  v_time);
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_daily_game(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_daily_game(text) TO authenticated;

-- Replace browser-side full reward_ledger row transfers with an owner-scoped
-- read-only summary. The ledger remains the sole authoritative source of truth.
-- The purchase, care and reward-writing functions are intentionally unchanged.
CREATE OR REPLACE FUNCTION public.reward_ledger_totals()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $reward$
DECLARE
 v_owner uuid:=auth.uid();
 v_earned bigint;
 v_spent bigint;
BEGIN
 IF v_owner IS NULL THEN
   RAISE EXCEPTION 'Authentication required' USING errcode='28000';
 END IF;
 SELECT coalesce(sum(r.coins_delta::bigint) FILTER (WHERE r.coins_delta>0),0),
        coalesce(-sum(r.coins_delta::bigint) FILTER (WHERE r.coins_delta<0),0)
 INTO v_earned,v_spent
 FROM public.reward_ledger r
 WHERE r.owner_id=v_owner;
 RETURN jsonb_build_object('earned',v_earned,'spent',v_spent);
END;
$reward$;
REVOKE ALL ON FUNCTION public.reward_ledger_totals() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reward_ledger_totals() TO authenticated,service_role;

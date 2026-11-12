-- Multiple independently managed countdowns; due-time worker already batches by timer ID.
DROP INDEX IF EXISTS public.beehive_timers_one_active_per_user;

CREATE OR REPLACE FUNCTION public.beehive_start_timer(p_seconds integer, p_label text DEFAULT 'Timer'::text)
 RETURNS beehive_timers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid := auth.uid(); created public.beehive_timers;
begin
 if u is null then raise exception 'Not signed in'; end if;
 if p_seconds is null or p_seconds < 10 or p_seconds > 86400 then raise exception 'Duration must be between 10 seconds and 24 hours'; end if;
 if trim(coalesce(p_label,''))='' or length(trim(p_label))>120 then raise exception 'Timer name must be 1-120 characters'; end if;
 insert into public.beehive_timers(owner_id,label,duration_seconds,due_at)
 values (u,trim(p_label),p_seconds,now()+make_interval(secs=>p_seconds))
 returning * into created;
 return created;
end;
$function$
;

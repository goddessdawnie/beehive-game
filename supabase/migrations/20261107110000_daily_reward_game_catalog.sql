-- Trusted registry of games allowed to award the fixed daily two-coin reward.
-- This is NOT the per-owner beehive_games visibility/preferences table.
-- For future games, add a reviewed game_key here after shipping its UI.
-- Do not grant insert/update/delete to authenticated users.
create table public.daily_reward_games (
  game_key text primary key,
  constraint daily_reward_games_key_format check (game_key ~ '^[a-z0-9][a-z0-9_-]{0,47}$')
);
alter table public.daily_reward_games enable row level security;
revoke all on table public.daily_reward_games from public, anon, authenticated;

insert into public.daily_reward_games(game_key) values
  ('wordle'), ('sudoku'), ('2048'), ('wumpus');

-- Preserve prior claim/history rows, while replacing the brittle hard-coded
-- allowlist with a foreign key to the trusted registry.
alter table public.daily_game_claims
  drop constraint if exists daily_game_claims_game_key_check;
alter table public.daily_game_claims
  add constraint daily_game_claims_rewardable_game_fkey
  foreign key (game_key) references public.daily_reward_games(game_key);

create or replace function public.claim_daily_game(p_game_key text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_date date := (now() at time zone 'America/New_York')::date;
  v_claimed uuid;
  v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'Sign in required'; end if;
  if not exists (
    select 1 from public.daily_reward_games
    where game_key = p_game_key
  ) then raise exception 'Unknown game'; end if;

  insert into public.daily_game_claims(owner_id,game_key,play_date)
  values(v_owner,p_game_key,v_date)
  on conflict do nothing returning owner_id into v_claimed;
  if v_claimed is null then return false; end if;

  insert into public.reward_ledger(owner_id,coins_delta,reason)
  values(v_owner,2,'game_daily:'||p_game_key||':'||v_date::text);
  return true;
end $function$;

comment on table public.daily_reward_games is
  'Trusted server-side eligible daily reward game keys. Register a new installed game here; not user-editable. Distinct from beehive_games visibility preferences.';

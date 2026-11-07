import {readFile,readdir} from 'node:fs/promises';
const fixture=JSON.parse(await readFile(new URL('./fixtures/live-contract.json',import.meta.url)));
const access=JSON.parse(await readFile(new URL('./fixtures/live-access.json',import.meta.url)));
const policies=JSON.parse(await readFile(new URL('./fixtures/live-policies.json',import.meta.url)));

// Synthetic data only. Caller must provide an empty, isolated database.
export async function initializeFixture(db,owner,other,{createRoles=true}={}){
 if(createRoles) await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;`);
 await db.exec(`
 create schema auth; create table auth.users(id uuid primary key);
 ${access.auth_uid};
 grant usage on schema auth to authenticated,anon,service_role;
 grant execute on function auth.uid() to authenticated,anon,service_role;
 create table public.pet_state(owner_id uuid primary key,name text,comfort_value numeric,comfort_updated_at timestamptz,care_anchor_at timestamptz,care_points numeric,last_care_at timestamptz);
 create table public.character_profiles(owner_id uuid,character_name text,character_card text);
 create table public.mochi_messages(id uuid primary key default gen_random_uuid(),owner_id uuid,role text,content text,created_at timestamptz default now());
 create table public.mochi_memories(owner_id uuid,kind text,memory_text text,updated_at timestamptz);
 create table public.beehive_push_subscriptions(id uuid primary key,owner_id uuid);
 `);
 const tables=[...new Set(fixture.schema.map(x=>x.table_name))];
 for(const table of tables){
  const cols=fixture.schema.filter(x=>x.table_name===table).map(x=>`${x.column_name} ${x.data_type==='ARRAY'?'text[]':x.data_type}${x.column_default?' default '+x.column_default:''}${x.is_nullable==='NO'?' not null':''}`);
  await db.exec(`create table public.${table} (${cols.join(',')});`);
 }
 // Exact constraints and trigger/function definitions captured from production; no user rows.
 for(const c of fixture.constraints.filter(x=>!x.definition.startsWith('FOREIGN KEY'))) await db.exec(`alter table public.${c.relname} add constraint ${c.conname} ${c.definition};`);
 for(const c of fixture.constraints.filter(x=>x.definition.startsWith('FOREIGN KEY'))) await db.exec(`alter table public.${c.relname} add constraint ${c.conname} ${c.definition};`);
 await db.exec(`create unique index reward_once_per_task on public.reward_ledger(task_id) where reason='task_completed';
 create unique index tasks_recurrence_occurrence_unique on public.tasks(recurrence_series_id,due_at) where recurrence_series_id is not null;
 create unique index activity_log_one_completion_per_task on public.activity_log(task_id) where outcome='completed' and task_id is not null;
 create unique index beehive_timers_one_active_per_user on public.beehive_timers(owner_id) where status in ('pending','sending');`);
 for(const f of fixture.functions) await db.exec(f.definition);
 for(const t of fixture.triggers) await db.exec(t.function_definition+';'+t.definition+';');
 for(const table of tables) await db.exec(`alter table public.${table} enable row level security;`);
 for(const g of access.grants) await db.exec(`grant ${g.privilege_type} on public.${g.table_name} to ${g.grantee};`);
 for(const p of policies) await db.exec(`create policy ${p.policyname} on public.${p.tablename} for ${p.cmd} to authenticated ${p.qual?'using ('+p.qual+')':''} ${p.with_check?'with check ('+p.with_check+')':''};`);
 await db.query('insert into auth.users values ($1),($2)',[owner,other]);
 await db.query('insert into pet_state values ($1,20,now())',[owner]);
 for(const path of (await readdir('supabase/migrations')).sort()) await db.exec(await readFile('supabase/migrations/'+path,'utf8'));
}

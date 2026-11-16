-- BEE-TASK-ORG-01: additive task context, independent of real deadlines.
-- Deliberately leaves existing task rows and due_at untouched.
-- Follow-up rollout must update task producers, Three Things RPC, and UI before
-- using planned_on or kae provenance. No automatic legacy origin backfill.
alter table public.tasks
  add column if not exists task_location text,
  add column if not exists task_category text,
  add column if not exists planned_on date;

-- Avoid changing the meaning of existing origin values.
alter table public.tasks drop constraint if exists task_origin_valid;
alter table public.tasks add constraint task_origin_valid
  check (task_origin = any (array['user','bee','synthesis','import','kae']::text[]));

-- Empty metadata should be represented by NULL; custom names remain permitted.
alter table public.tasks drop constraint if exists task_location_nonblank;
alter table public.tasks add constraint task_location_nonblank
  check (task_location is null or length(btrim(task_location)) > 0);
alter table public.tasks drop constraint if exists task_category_nonblank;
alter table public.tasks add constraint task_category_nonblank
  check (task_category is null or length(btrim(task_category)) > 0);

comment on column public.tasks.planned_on is
  'Optional America/New_York calendar date selected for attention; never a due date or recurrence anchor.';
comment on column public.tasks.task_location is
  'Optional task-instance location; independent of reusable activity catalog.';
comment on column public.tasks.task_category is
  'Optional task-instance category; independent of reusable activity catalog.';

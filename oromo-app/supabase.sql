-- Run this once in Supabase: SQL Editor > New query > paste > Run
create table if not exists progress (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table progress enable row level security;
create policy "read own progress"   on progress for select using (auth.uid() = user_id);
create policy "insert own progress" on progress for insert with check (auth.uid() = user_id);
create policy "update own progress" on progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

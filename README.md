# Payroll Quiz Minimal Rotation

This version stores only one shared counter in Supabase.

## Backend behavior
- no email
- no employee ID
- no replay check
- every new load gets the next set
- sequence: 1 -> 2 -> 3 -> ... -> 12 -> 1

## Files
- `index.html`
- `api/next-set.js`
- `api/health.js`

## Required Vercel environment variables
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Required Supabase SQL
```sql
drop table if exists quiz_players;

create table if not exists quiz_rotation (
  id integer primary key,
  next_set integer not null default 1,
  updated_at timestamptz not null default now()
);

insert into quiz_rotation (id, next_set)
values (1, 1)
on conflict (id) do update set next_set = 1, updated_at = now();

create or replace function assign_next_set()
returns integer
language plpgsql
security definer
as $$
declare
  current_set integer;
begin
  update quiz_rotation
  set
    next_set = case
      when next_set >= 12 then 1
      else next_set + 1
    end,
    updated_at = now()
  where id = 1
  returning case
    when next_set = 1 then 12
    else next_set - 1
  end
  into current_set;

  return current_set;
end;
$$;
```

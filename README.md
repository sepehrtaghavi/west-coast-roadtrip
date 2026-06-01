# The Adventure of Sarah, Sepehr & Kye

Static GitHub Pages site for the West Coast road trip itinerary.

## Publish

Publish this folder with GitHub Pages. The site entry point is `Adventure.html`.

## Shared Checklist State

The site works without a backend, but booking/checklist state is then saved only in each browser.
For universal state across everyone, create a Supabase project and table:

```sql
create table trip_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table trip_state enable row level security;

create policy "public read trip state"
on trip_state for select
using (id = 'west-coast-roadtrip-2026');

create policy "public create trip state"
on trip_state for insert
with check (id = 'west-coast-roadtrip-2026');

create policy "public update trip state"
on trip_state for update
using (id = 'west-coast-roadtrip-2026')
with check (id = 'west-coast-roadtrip-2026');
```

Then update `trip-config.js`:

```js
window.TRIP_SYNC_CONFIG = {
  provider: 'supabase',
  url: 'https://YOUR_PROJECT.supabase.co',
  anonKey: 'YOUR_PUBLIC_ANON_KEY',
  table: 'trip_state',
  id: 'west-coast-roadtrip-2026',
};
```

The Supabase anon key is public by design. The table policies above limit reads and writes to this one trip row.

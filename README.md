# Shankmaster

Golf betting tracker. Migrated off Genspark to a self-owned stack:

- **Frontend:** static HTML/CSS/JS (unchanged from the original app).
- **Backend:** Supabase (Postgres) via PostgREST. See `supabase/01_schema.sql`.
- **Adapter:** `js/supabase-adapter.js` translates the app's original
  `tables/*` calls to Supabase, so `app.js` was not modified.
- **Hosting:** GitHub Pages. Installable on iPhone via Add to Home Screen (PWA).

## Config
Set your project URL + anon key in `js/supabase-config.js`.

## Data
Real player/game data lives in Supabase, not in this repo. Local exports and the
seed file are gitignored.

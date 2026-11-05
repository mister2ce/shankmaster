-- Garmin -> GHIN -> Shankmaster sync (2026-11-05).
-- Adds the tables the "Sync" button and golf.py share, plus foursome fields.
-- Additive only: no existing column or row is changed.

-- ---------- partidas: foursome bets ----------
alter table partidas add column if not exists tipo text not null default 'individual';
alter table partidas add column if not exists companero_id uuid;
alter table partidas add column if not exists rivales_ids uuid[];
alter table partidas drop constraint if exists partidas_tipo_check;
alter table partidas add constraint partidas_tipo_check check (tipo in ('individual', 'foursome'));

-- ---------- rondas: one row per Garmin round (page reads, only the sync writes) ----------
create table if not exists rondas (
  garmin_id      bigint primary key,
  fecha          date not null,          -- local (Mexico City) date the round was played
  campo_garmin   text,                   -- course name as Garmin has it
  campo_ghin     text,                   -- GHIN course name, when resolved
  tee            text,
  hoyos          integer,
  gross          integer,
  putts          integer,
  fairways_hit   integer,
  fairways_total integer,
  ghin_estado    text,                   -- publicado | ya_en_ghin | fallo | pendiente | omitido
  ghin_score_id  text,
  ajustado       integer,
  diferencial    numeric,
  nota           text,
  detalle        jsonb,                  -- Garmin hole detail, cached so a sync skips re-reading it
  updated_at     timestamptz default now()
);
create index if not exists rondas_fecha on rondas (fecha);
drop trigger if exists t_rondas_updated on rondas;
create trigger t_rondas_updated before update on rondas
  for each row execute function set_updated_at();

-- ---------- sync_runs: progress + result of each sync (page reads) ----------
create table if not exists sync_runs (
  id          uuid primary key default gen_random_uuid(),
  origen      text not null default 'app',      -- app | mac
  estado      text not null default 'queued',   -- queued | running | done | failed
  etapa       integer not null default 0,       -- 0..5, drives the progress bar
  etapa_texto text not null default 'Iniciando',
  resultados  jsonb not null default '[]'::jsonb,
  mensaje     text,
  gh_run_url  text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  finished_at timestamptz,
  constraint sync_runs_estado_check check (estado in ('queued', 'running', 'done', 'failed'))
);
-- Only one sync may be active at a time (the button and the Mac share this).
create unique index if not exists sync_runs_one_active on sync_runs ((true))
  where estado in ('queued', 'running');
drop trigger if exists t_sync_runs_updated on sync_runs;
create trigger t_sync_runs_updated before update on sync_runs
  for each row execute function set_updated_at();

-- ---------- private: posted log + shared state (never readable by the page) ----------
create table if not exists golf_posted (
  id         bigserial primary key,
  garmin_id  bigint not null,
  record     jsonb not null,
  created_at timestamptz default now()
);
create index if not exists golf_posted_garmin on golf_posted (garmin_id);

create table if not exists golf_kv (
  k          text primary key,     -- garmin_tokens | courses
  v          jsonb not null,
  updated_at timestamptz default now()
);
drop trigger if exists t_golf_kv_updated on golf_kv;
create trigger t_golf_kv_updated before update on golf_kv
  for each row execute function set_updated_at();

-- ---------- access ----------
alter table rondas      enable row level security;
alter table sync_runs   enable row level security;
alter table golf_posted enable row level security;
alter table golf_kv     enable row level security;

-- The page may READ rounds and sync progress. Writes come only from the
-- service key (golf.py and the edge function), which bypasses RLS.
drop policy if exists anon_read_rondas on rondas;
create policy anon_read_rondas on rondas for select to anon, authenticated using (true);
drop policy if exists anon_read_sync_runs on sync_runs;
create policy anon_read_sync_runs on sync_runs for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on rondas, sync_runs from anon, authenticated;

-- Private tables: no policy at all, and no grants either.
revoke all on golf_posted, golf_kv from anon, authenticated;
revoke all on sequence golf_posted_id_seq from anon, authenticated;

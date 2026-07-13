-- Shankmaster schema for Supabase (Postgres)
-- Mirrors the Genspark table structure exactly. Run this ONCE in the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- updated_at auto-bump
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------- jugadores (players) ----------
create table if not exists jugadores (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  sliding_inicial text,
  sliding_actual  text,
  notas           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
drop trigger if exists t_jugadores_updated on jugadores;
create trigger t_jugadores_updated before update on jugadores
  for each row execute function set_updated_at();

-- ---------- campos (courses) ----------
create table if not exists campos (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
drop trigger if exists t_campos_updated on campos;
create trigger t_campos_updated before update on campos
  for each row execute function set_updated_at();

-- ---------- partidas (games / bets) ----------
create table if not exists partidas (
  id               uuid primary key default gen_random_uuid(),
  fecha            bigint,          -- epoch milliseconds (as the app stores it)
  campo            text,
  jugador_id       uuid,
  jugador_nombre   text,
  sliding_usado    text,
  sliding_anterior text,
  sliding_nuevo    text,
  score_mio        integer,
  score_suyo       integer,
  resultado        text,
  carry            boolean default false,   -- empate a los 9: el sliding NO se mueve
  importe          numeric,
  notas            text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
drop trigger if exists t_partidas_updated on partidas;
create trigger t_partidas_updated before update on partidas
  for each row execute function set_updated_at();

-- ---------- Access posture: NO LOGIN yet (matches current app) ----------
-- Anon key gets full read/write. We tighten this when we add the PIN/login.
alter table jugadores enable row level security;
alter table campos    enable row level security;
alter table partidas  enable row level security;

drop policy if exists anon_all_jugadores on jugadores;
drop policy if exists anon_all_campos    on campos;
drop policy if exists anon_all_partidas  on partidas;

create policy anon_all_jugadores on jugadores for all
  to anon, authenticated using (true) with check (true);
create policy anon_all_campos on campos for all
  to anon, authenticated using (true) with check (true);
create policy anon_all_partidas on partidas for all
  to anon, authenticated using (true) with check (true);

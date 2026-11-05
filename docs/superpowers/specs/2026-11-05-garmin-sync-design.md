# Sync Everything: Garmin to GHIN to Shankmaster

Decided with Alejandro on 2026-11-05 (grilling session). He depends on this for
tracking bets and scores with other people, so correctness beats speed.

## His flow, after this ships

1. Play, keep score on the watch.
2. Whenever convenient, sync the watch to Garmin Connect.
3. Open Shankmaster, tap the sync icon on the home screen.
4. One cloud run posts any new round to GHIN (hole by hole, putts, driving
   accuracy, verified by read-back) and stores the round in Shankmaster.
5. New partida: the date defaults to today in Mexico City, and Mi score + Campo
   fill from that day's Garmin round. He types the opponent's score and the
   amount, saves.

## Rulings (his)

- One button does both GHIN and Shankmaster.
- Manual only. No timer, no scheduled sync.
- Saved partidas are never changed by a sync. Sync only prefills the new-partida
  form. The prefilled field stays editable; what he types wins.
- No round that date: field empty, typed by hand as today. Two rounds that
  date: the form asks which. 9-hole round fills the 9-hole gross.
- While running: a progress bar with the real stages (Iniciando, Conectando a
  Garmin, Leyendo rondas, Publicando en GHIN, Guardando en Shankmaster, Listo).
- Result in Spanish with the golf.py marks. A GHIN failure still stores the
  Garmin round in Shankmaster.
- `/golf-score` on the Mac stays as the backup, sharing one posted log with the
  cloud so neither can double-post.
- No login on Shankmaster, ever. Only one sync may run at a time (correctness,
  not access control).
- Placement: one sync icon on the home screen. (Read as home screen only; the
  in-form icon was offered and not taken.)
- Testing never touches his real handicap: no deleting or re-posting a GHIN
  score. Final proof is his next real round.

## Architecture (my calls, approved in outline)

- **Cloud job:** GitHub Actions in a new PRIVATE repo `mister2ce/golf-sync`
  running the same `golf.py`. Credentials are encrypted Actions secrets. Free
  tier (2,000 min/month, a run is about a minute). TZ=America/Mexico_City.
- **Trigger:** the page calls a Supabase Edge Function, which holds the only
  GitHub token able to start the workflow and refuses while a run is active.
  Nothing secret in the public page or the public repo.
- **Shared state in Supabase, service-role only (no anon policy):**
  - posted log (replaces `posted.jsonl`)
  - Garmin token store (Garmin rotates the refresh token on every renewal, so
    two copies would break each other)
- **Readable by the page:** `rondas` (date, course, gross, holes, putts,
  fairways, GHIN status, differential, Garmin id) and `sync_runs` (status,
  stage, result lines, timestamps).
- **New course from Garmin** not in `campos`: added automatically.
- **Date bug fix:** `new Date().toISOString()` defaults the form to the UTC date,
  so any partida entered after 6 pm Mexico City shows tomorrow. Use the
  America/Mexico_City date.

## Test plan

1. Cloud probe: dry run from GitHub Actions logs in to Garmin and GHIN, lists
   rounds, posts nothing. If blocked, stop and re-decide.
2. Offline tests: existing 10 plus Mexico City date, prefill on empty form,
   saved partida untouched, two rounds one day, shared-log double-post guard,
   second tap while running, GHIN failure still stores the round.
3. Live run against real data, phone-sized browser: 13 rounds show as already on
   GHIN, nothing posted, all land in Shankmaster, a new partida dated Nov 4
   fills 93 / Lomas. Every number checked against Garmin and GHIN.
4. His next round, end to end.

## Out of scope (next round)

- The UX changes he has queued.
- A "Mis rondas" screen.

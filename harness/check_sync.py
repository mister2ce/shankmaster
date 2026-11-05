"""Phone-width browser harness for the Garmin sync + foursome changes.

Serves the app locally and answers every Supabase call with an in-memory fake
(PostgREST shapes, the golf-sync function, sync_runs progress), so nothing
real is read or written. Runs each scenario in WebKit (iPhone) and Chromium.

Run: ~/work/chief-of-staff/.venv-playwright/bin/python harness/check_sync.py
"""
import functools
import http.server
import json
import re
import socketserver
import sys
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SUPA = "https://rjaxaxvrpjqlnkzspoqq.supabase.co"
MX = timezone(timedelta(hours=-6))
OUT = Path("/tmp/shankmaster-harness")
OUT.mkdir(exist_ok=True)

FOURSOME_ID = "f0000000-0000-0000-0000-000000000000"
P = {"pepe": "a0000000-0000-0000-0000-000000000001", "beto": "a0000000-0000-0000-0000-000000000002",
     "memo": "a0000000-0000-0000-0000-000000000003", "tono": "a0000000-0000-0000-0000-000000000004"}


def mx_ms(y, m, d, h=12):
    return int(datetime(y, m, d, h, tzinfo=MX).timestamp() * 1000)


def base_data():
    jug = [{"id": FOURSOME_ID, "nombre": "A Foursome y Otros", "sliding_inicial": "0", "sliding_actual": "+2"},
           {"id": "f0000000-0000-0000-0000-000000000009", "nombre": "A Foursome", "sliding_inicial": "0",
            "sliding_actual": "0"},
           {"id": P["pepe"], "nombre": "Pepe Ejemplo", "sliding_inicial": "+19", "sliding_actual": "+20"},
           {"id": P["beto"], "nombre": "Beto Prueba", "sliding_inicial": "+12", "sliding_actual": "+10"},
           {"id": P["memo"], "nombre": "Memo Muestra", "sliding_inicial": "+15", "sliding_actual": "+14"},
           {"id": P["tono"], "nombre": "Toño Demo", "sliding_inicial": "+13", "sliding_actual": "+13"}]
    for j in jug:
        j.update(notas="", created_at="2026-07-12T00:00:00Z", updated_at="2026-07-12T00:00:00Z")
    part = [
        {"id": "p1", "fecha": mx_ms(2026, 11, 4), "campo": "Lomas Country Club", "jugador_id": P["pepe"],
         "jugador_nombre": "Pepe Ejemplo", "sliding_usado": "+20", "sliding_anterior": "+20",
         "sliding_nuevo": "+21", "score_mio": 93, "score_suyo": 80, "resultado": "Perdido", "carry": False,
         "importe": "450", "notas": "", "tipo": "individual", "companero_id": None, "rivales_ids": None,
         "created_at": "2026-11-05T00:35:23Z"},
        {"id": "p2", "fecha": mx_ms(2026, 11, 4), "campo": "Lomas Country Club", "jugador_id": FOURSOME_ID,
         "jugador_nombre": "A Foursome y Otros", "sliding_usado": "+2", "sliding_anterior": "+2",
         "sliding_nuevo": "+3", "score_mio": 100, "score_suyo": 100, "resultado": "Perdido", "carry": False,
         "importe": "500", "notas": "2ce/memo vs beto/pepe", "tipo": "individual", "companero_id": None,
         "rivales_ids": None, "created_at": "2026-11-05T00:40:41Z"},
    ]
    part.append(dict(part[1], id="p3", fecha=mx_ms(2026, 2, 1), jugador_id="f0000000-0000-0000-0000-000000000009",
                     jugador_nombre="A Foursome", notas="2ce/x vs y/z"))
    campos = [{"id": "c1", "nombre": "Chiluca"}, {"id": "c2", "nombre": "Lomas Country Club"},
              {"id": "c3", "nombre": "Paraiso"}]
    return {"jugadores": jug, "partidas": part, "campos": campos, "rondas": [], "sync_runs": []}


def ronda(gid, fecha, gross, campo_garmin="Lomas Country Club",
          campo_ghin="LOMAS COUNTRY CLUB / LOMAS COUNTRY", hoyos=18, estado="publicado"):
    return {"garmin_id": gid, "fecha": fecha, "campo_garmin": campo_garmin, "campo_ghin": campo_ghin,
            "gross": gross, "hoyos": hoyos, "ghin_estado": estado, "diferencial": 19.0}


class Fake:
    """In-memory Supabase. Records every write so scenarios can assert on it."""

    def __init__(self, data, run_script=None, fn_error=None, active_run=None, rondas_after=None):
        self.d = data
        self.writes = []
        self.fn_calls = 0
        self.run_script = run_script or []
        self.run_reads = 0
        self.fn_error = fn_error
        self.active_run = active_run
        self.rondas_after = rondas_after

    def handle(self, route):
        req = route.request
        u = urlparse(req.url)
        cors = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "*", "Access-Control-Expose-Headers": "Content-Range"}
        if req.method == "OPTIONS":
            return route.fulfill(status=200, headers=cors, body="ok")
        if u.path == "/functions/v1/golf-sync":
            self.fn_calls += 1
            if self.fn_error:
                return route.fulfill(status=500, headers=cors, json={"error": self.fn_error})
            return route.fulfill(status=200, headers=cors, json={"id": "run-1"})
        table = u.path.split("/rest/v1/")[-1]
        q = parse_qs(u.query)
        if req.method == "GET":
            if table == "sync_runs":
                if "estado" in q:  # resume check
                    rows = [self.active_run] if self.active_run else []
                    return route.fulfill(status=200, headers=cors, json=rows)
                i = min(self.run_reads, len(self.run_script) - 1)
                self.run_reads += 1
                run = dict(self.run_script[i])
                if run["estado"] == "done" and self.rondas_after is not None:
                    self.d["rondas"] = self.rondas_after
                return route.fulfill(status=200, headers=cors, json=[run])
            rows = self.d.get(table, [])
            if table == "rondas":
                rows = sorted(rows, key=lambda r: r["fecha"], reverse=True)
            h = dict(cors, **{"Content-Range": f"0-{max(len(rows) - 1, 0)}/{len(rows)}"})
            return route.fulfill(status=200, headers=h, json=rows)
        body = json.loads(req.post_data or "{}")
        self.writes.append({"method": req.method, "table": table, "query": u.query, "body": body})
        if req.method == "POST" and table in self.d:
            row = dict(body, id=f"new{len(self.writes)}", created_at=datetime.now(timezone.utc).isoformat())
            self.d[table].append(row)
            return route.fulfill(status=201, headers=cors, json=[row])
        return route.fulfill(status=204, headers=cors, body="")


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = functools.partial(Quiet, directory=str(ROOT))
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}/"


FAILS = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else f"  -> {detail}"))
    if not cond:
        FAILS.append(name)


def open_app(browser, url, fake, now_mx, engine):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                              is_mobile=engine != "firefox", has_touch=True,
                              service_workers="block")
    page = ctx.new_page()
    page.clock.install(time=now_mx)
    page.clock.resume()
    errors, dialogs = [], []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    def on_dialog(d):
        dialogs.append(d.message)
        d.accept()
    page.on("dialog", on_dialog)
    page.route(SUPA + "/**", fake.handle)
    page.goto(url)
    page.wait_for_function("window.golfSync && typeof state !== 'undefined' && state.jugadores.length > 0")
    page.wait_for_timeout(400)
    return ctx, page, errors, dialogs


def nueva_partida(page):
    page.click('[data-tab="partidas"]')
    page.click("#btn-nueva-partida")
    page.wait_for_timeout(300)


def val(page, sel):
    return page.eval_on_selector(sel, "e => e.value")


def run_all(engine, browser, url):
    print(f"\n== {engine} ==")

    # 1. After 6 pm: the date is today's in Mexico City, and the round fills the form.
    d = base_data()
    d["rondas"] = [ronda(1, "2026-11-05", 93)]
    f = Fake(d)
    ctx, page, errors, dialogs = open_app(browser, url, f, datetime(2026, 11, 5, 19, 30, tzinfo=MX), engine)
    check("7:30 pm: app's own default date is Nov 5", val(page, "#partida-fecha") == "2026-11-05",
          val(page, "#partida-fecha"))
    nueva_partida(page)
    check("7:30 pm: date is Nov 5 (not UTC Nov 6)", val(page, "#partida-fecha") == "2026-11-05",
          val(page, "#partida-fecha"))
    check("Mi score filled from Garmin", val(page, "#partida-score-mio") == "93", val(page, "#partida-score-mio"))
    check("course from Garmin", val(page, "#partida-campo-select") == "Lomas Country Club")
    chip = page.inner_text("#ronda-chip")
    check("chip names the round", "5 nov" in chip and "93" in chip and "GHIN ✓" in chip, chip)
    page.screenshot(path=str(OUT / f"{engine}-1-prefill.png"), full_page=False)

    # 7. Save an individual bet: score, type and local-noon date go out; sliding moves.
    page.select_option("#partida-jugador", P["pepe"])
    page.fill("#partida-score-suyo", "80")
    page.select_option("#partida-resultado", "Ganado")
    page.fill("#partida-importe", "450")
    page.click('#form-partida button[type="submit"]')
    page.wait_for_timeout(600)
    posts = [w for w in f.writes if w["table"] == "partidas" and w["method"] == "POST"]
    check("individual saved once", len(posts) == 1, f.writes)
    if posts:
        b = posts[0]["body"]
        check("saved score 93 / 80, tipo individual", b["score_mio"] == 93 and b["score_suyo"] == 80
              and b["tipo"] == "individual", b)
        check("saved date is Nov 5 local noon", b["fecha"] == mx_ms(2026, 11, 5), b["fecha"])
        check("saved course Lomas", b["campo"] == "Lomas Country Club", b["campo"])
    check("sliding updated for the opponent",
          any(w["table"] == "jugadores" and w["method"] == "PATCH" for w in f.writes), f.writes)
    check("no console errors", not errors, errors)
    ctx.close()

    # 2. Next morning, round from yesterday and no bets yet: date defaults to the round.
    d = base_data()
    d["rondas"] = [ronda(1, "2026-11-05", 93)]
    f = Fake(d)
    ctx, page, errors, _ = open_app(browser, url, f, datetime(2026, 11, 6, 9, 0, tzinfo=MX), engine)
    nueva_partida(page)
    check("morning after: date is the round's (Nov 5)", val(page, "#partida-fecha") == "2026-11-05",
          val(page, "#partida-fecha"))
    check("morning after: score 93", val(page, "#partida-score-mio") == "93")
    ctx.close()

    # 3. A day already logged long ago does not capture today's bets.
    d = base_data()
    d["rondas"] = [ronda(1, "2026-11-04", 93)]
    f = Fake(d)
    ctx, page, errors, _ = open_app(browser, url, f, datetime(2026, 11, 6, 17, 0, tzinfo=MX), engine)
    nueva_partida(page)
    check("closed day: date is today (Nov 6)", val(page, "#partida-fecha") == "2026-11-06",
          val(page, "#partida-fecha"))
    check("closed day: score left empty", val(page, "#partida-score-mio") == "")
    check("closed day: chip says sync", "↻" in page.inner_text("#ronda-chip"), page.inner_text("#ronda-chip"))

    # 4. What he types wins.
    page.fill("#partida-score-mio", "95")
    page.fill("#partida-fecha", "2026-11-04")
    page.dispatch_event("#partida-fecha", "change")
    page.wait_for_timeout(200)
    check("typed score kept when a round is found", val(page, "#partida-score-mio") == "95",
          val(page, "#partida-score-mio"))
    ctx.close()

    # 5. Garmin overrides the default course, maps Paraiso, and adds Bosque Real.
    d = base_data()
    d["rondas"] = [ronda(1, "2026-10-23", 89, "Bosquereal Country Club ~ 18", "BOSQUE REAL COUNTRY CLUB / BOSQUE"),
                   ronda(2, "2026-10-24", 85, "Club de Golf Paraíso", None, estado="pendiente")]
    f = Fake(d)
    ctx, page, errors, _ = open_app(browser, url, f, datetime(2026, 10, 24, 15, 0, tzinfo=MX), engine)
    nueva_partida(page)
    check("Paraíso maps to existing 'Paraiso'", val(page, "#partida-campo-select") == "Paraiso",
          val(page, "#partida-campo-select"))
    check("pending GHIN shown on chip", "GHIN pendiente" in page.inner_text("#ronda-chip"))
    page.fill("#partida-fecha", "2026-10-23")
    page.dispatch_event("#partida-fecha", "change")
    page.wait_for_timeout(200)
    check("Bosque Real overrides the Lomas default", val(page, "#partida-campo-select") == "__nuevo__"
          and val(page, "#partida-campo-nuevo") == "Bosque Real Country Club",
          (val(page, "#partida-campo-select"), val(page, "#partida-campo-nuevo")))
    check("score follows the date change", val(page, "#partida-score-mio") == "89", val(page, "#partida-score-mio"))
    ctx.close()

    # 6. Two rounds on one day: it asks.
    d = base_data()
    d["rondas"] = [ronda(1, "2026-11-05", 46, hoyos=9), ronda(2, "2026-11-05", 91)]
    f = Fake(d)
    ctx, page, errors, _ = open_app(browser, url, f, datetime(2026, 11, 5, 18, 0, tzinfo=MX), engine)
    nueva_partida(page)
    btns = page.query_selector_all("#ronda-chip .ronda-opcion")
    check("two rounds: two choices", len(btns) == 2, len(btns))
    check("two rounds: nothing filled before choosing", val(page, "#partida-score-mio") == "")
    if len(btns) == 2:
        target = [b for b in btns if "91" in b.inner_text()][0]
        target.click()
        check("choice fills 91", val(page, "#partida-score-mio") == "91")
    ctx.close()

    # 8. Foursome: no scores, partner and rivals stored, no sliding moves.
    d = base_data()
    d["rondas"] = [ronda(1, "2026-11-05", 93)]
    f = Fake(d)
    ctx, page, errors, dialogs = open_app(browser, url, f, datetime(2026, 11, 5, 18, 0, tzinfo=MX), engine)
    nueva_partida(page)
    page.click('.tipo-btn[data-tipo="foursome"]')
    check("foursome hides the score section", page.is_hidden("#scores-section"))
    check("foursome hides the opponent picker", page.is_hidden("#grupo-contrincante"))
    opts = page.eval_on_selector_all("#foursome-companero option", "os => os.map(o => o.textContent)")
    check("foursome pseudo-players not offered as partner",
          not any(o.startswith("A Foursome") for o in opts), opts)
    page.screenshot(path=str(OUT / f"{engine}-2-foursome.png"), full_page=False)
    page.select_option("#foursome-companero", P["memo"])
    page.select_option("#foursome-rival1", P["beto"])
    page.select_option("#foursome-rival2", P["memo"])
    page.select_option("#partida-resultado", "Perdido")
    page.fill("#partida-importe", "500")
    page.click('#form-partida button[type="submit"]')
    page.wait_for_timeout(400)
    check("same player twice is refused", any("dos veces" in m for m in dialogs) and
          not any(w["table"] == "partidas" for w in f.writes), (dialogs, f.writes))
    page.select_option("#foursome-rival2", P["pepe"])
    page.fill("#partida-notas", "apuesta doble")
    page.click('#form-partida button[type="submit"]')
    page.wait_for_timeout(600)
    posts = [w for w in f.writes if w["table"] == "partidas" and w["method"] == "POST"]
    check("foursome saved once", len(posts) == 1, f.writes)
    if posts:
        b = posts[0]["body"]
        check("foursome: no scores", b["score_mio"] is None and b["score_suyo"] is None, b)
        check("foursome: tipo, partner, rivals", b["tipo"] == "foursome" and b["companero_id"] == P["memo"]
              and b["rivales_ids"] == [P["beto"], P["pepe"]], b)
        check("foursome: against the foursome player", b["jugador_id"] == FOURSOME_ID, b["jugador_id"])
        check("foursome: names written in notes",
              b["notas"] == "2ce/Memo Muestra vs Beto Prueba/Pepe Ejemplo\napuesta doble", b["notas"])
        check("foursome: sliding frozen", b["sliding_nuevo"] == b["sliding_anterior"], b)
    check("foursome: no sliding PATCH", not any(w["table"] == "jugadores" for w in f.writes), f.writes)
    check("no console errors (foursome)", not errors, errors)
    ctx.close()

    # 9 + 14. History shows "-" for foursomes; editing an old bet prefills nothing.
    d = base_data()
    d["rondas"] = [ronda(1, "2026-11-04", 99)]
    f = Fake(d)
    ctx, page, errors, _ = open_app(browser, url, f, datetime(2026, 11, 5, 10, 0, tzinfo=MX), engine)
    page.click('[data-tab="partidas"]')
    page.wait_for_timeout(300)
    rows = page.inner_text("#partidas-tbody")
    cells = page.evaluate("""() => [...document.querySelectorAll('#partidas-tbody tr')]
        .filter(tr => tr.textContent.includes('A Foursome')).map(tr => tr.children[4].textContent.trim())""")
    check("old foursomes show -", cells and all(c == "-" for c in cells) and "100 - 100" not in rows, cells)
    check("individual still shows its score", "93 - 80" in rows, rows[:300])
    page.evaluate("editarPartida('p1')")
    page.wait_for_timeout(300)
    check("edit keeps saved score 93 (not Garmin's 99)", val(page, "#partida-score-mio") == "93",
          val(page, "#partida-score-mio"))
    check("edit shows no Garmin chip", page.is_hidden("#ronda-chip"))
    page.evaluate("editarPartida('p2')")  # old foursome bet: must stay as saved
    page.wait_for_timeout(300)
    check("old foursome edit keeps its player", val(page, "#partida-jugador") == FOURSOME_ID,
          val(page, "#partida-jugador"))
    check("old foursome edit stays individual with its 100s", val(page, "#partida-tipo") == "individual"
          and val(page, "#partida-score-mio") == "100", (val(page, "#partida-tipo"), val(page, "#partida-score-mio")))
    page.fill("#partida-importe", "550")
    page.click('#form-partida button[type="submit"]')
    page.wait_for_timeout(600)
    puts = [w for w in f.writes if w["table"] == "partidas" and w["method"] == "PATCH"]
    check("old foursome edit saves only as before", len(puts) == 1 and puts[0]["body"]["score_mio"] == 100
          and puts[0]["body"]["tipo"] == "individual" and puts[0]["body"]["notas"] == "2ce/memo vs beto/pepe",
          puts)
    ctx.close()

    # 10 + 11. Sync: progress, a second tap does not start another, results, rondas reload.
    d = base_data()
    script = [
        {"id": "run-1", "estado": "queued", "etapa": 0, "etapa_texto": "Iniciando", "resultados": [],
         "updated_at": "2026-11-06T00:00:00Z"},
        {"id": "run-1", "estado": "running", "etapa": 1, "etapa_texto": "Conectando a Garmin", "resultados": [],
         "updated_at": "2026-11-06T00:00:10Z"},
        {"id": "run-1", "estado": "running", "etapa": 3, "etapa_texto": "Publicando en GHIN", "resultados": [],
         "updated_at": "2026-11-06T00:00:20Z"},
        {"id": "run-1", "estado": "done", "etapa": 5, "etapa_texto": "Listo", "mensaje": None,
         "updated_at": "2026-11-06T00:00:30Z",
         "resultados": [{"marca": "=", "fecha": "2026-10-30", "campo": "LOMAS COUNTRY CLUB / LOMAS COUNTRY",
                         "gross": 90, "texto": "ya en GHIN (ajustado 89)"},
                        {"marca": "✓", "fecha": "2026-11-05", "campo": "LOMAS COUNTRY CLUB / LOMAS COUNTRY",
                         "gross": 92, "texto": "publicada en GHIN · ajustado 91 · diferencial 18.1"}]},
    ]
    f = Fake(d, run_script=script, rondas_after=[ronda(9, "2026-11-05", 92)])
    ctx, page, errors, _ = open_app(browser, url, f, datetime(2026, 11, 5, 18, 0, tzinfo=MX), engine)
    nueva_partida(page)
    check("before sync: no score", val(page, "#partida-score-mio") == "")
    page.click("#btn-sync")
    page.wait_for_timeout(150)
    check("panel opens", page.is_visible("#sync-panel"))
    check("icon spins", "girando" in page.get_attribute("#btn-sync", "class"))
    page.screenshot(path=str(OUT / f"{engine}-3-syncing.png"), full_page=False)
    page.click("#btn-sync")
    page.wait_for_timeout(100)
    check("second tap does not start another sync", f.fn_calls == 1, f.fn_calls)
    page.wait_for_function("document.getElementById('sync-titulo').textContent === 'Listo'", timeout=15000)
    res = page.inner_text("#sync-resultados")
    check("result lists the new GHIN post", "✓" in res and "5 nov" in res and "diferencial 18.1" in res, res)
    check("result counts rounds already on GHIN", "1 ronda ya estaba en GHIN" in res, res)
    check("icon stops", "girando" not in page.get_attribute("#btn-sync", "class"))
    page.wait_for_timeout(300)
    check("after sync the open form fills 92", val(page, "#partida-score-mio") == "92",
          val(page, "#partida-score-mio"))
    page.screenshot(path=str(OUT / f"{engine}-4-done.png"), full_page=False)
    width = page.evaluate("document.documentElement.scrollWidth")
    check("no sideways scroll at 390px", width <= 390, width)
    check("no console errors (sync)", not errors, errors)
    ctx.close()

    # 12. Reopening the app mid-sync picks the run back up.
    d = base_data()
    now = datetime(2026, 11, 5, 18, 0, tzinfo=MX)
    active = {"id": "run-1", "updated_at": (now - timedelta(seconds=20)).astimezone(timezone.utc).isoformat()}
    f = Fake(d, run_script=[dict(script[2], updated_at=active["updated_at"])], active_run=active)
    ctx, page, errors, _ = open_app(browser, url, f, now, engine)
    page.wait_for_timeout(500)
    check("resume: panel open on load", page.is_visible("#sync-panel"))
    check("resume: shows the stage", "Publicando en GHIN" in page.inner_text("#sync-etapa"),
          page.inner_text("#sync-etapa"))
    check("resume: did not start a new sync", f.fn_calls == 0, f.fn_calls)
    ctx.close()

    # 13. The function cannot start the job: plain message, icon stops.
    d = base_data()
    f = Fake(d, fn_error="No se pudo iniciar la sincronización en GitHub (401).")
    ctx, page, errors, _ = open_app(browser, url, f, datetime(2026, 11, 5, 18, 0, tzinfo=MX), engine)
    page.click("#btn-sync")
    page.wait_for_timeout(500)
    check("start failure shown", "GitHub (401)" in page.inner_text("#sync-mensaje"),
          page.inner_text("#sync-mensaje"))
    check("start failure: icon stops", "girando" not in page.get_attribute("#btn-sync", "class"))
    ctx.close()

    # Failed run from the job: message and the ! lines.
    d = base_data()
    failed = [{"id": "run-1", "estado": "failed", "etapa": 2, "etapa_texto": "Leyendo rondas",
               "updated_at": "2026-11-06T00:00:30Z",
               "mensaje": "GHIN no respondió. Tus rondas nuevas ya están en Shankmaster; vuelve a sincronizar más tarde para publicarlas en GHIN.",
               "resultados": [{"marca": "!", "fecha": "2026-11-05", "campo": "Lomas Country Club", "gross": 92,
                               "texto": "guardada en Shankmaster; falta publicar en GHIN"}]}]
    f = Fake(d, run_script=failed)
    ctx, page, errors, _ = open_app(browser, url, f, datetime(2026, 11, 5, 18, 0, tzinfo=MX), engine)
    page.click("#btn-sync")
    page.wait_for_function("document.getElementById('sync-titulo').textContent === 'No se completó'", timeout=8000)
    check("failed run: message shown", "GHIN no respondió" in page.inner_text("#sync-mensaje"))
    check("failed run: round line shown", "falta publicar" in page.inner_text("#sync-resultados"))
    page.screenshot(path=str(OUT / f"{engine}-5-failed.png"), full_page=False)
    ctx.close()


def main():
    srv, url = serve()
    try:
        with sync_playwright() as pw:
            for engine in sys.argv[1:] or ["webkit", "chromium"]:
                browser = getattr(pw, engine).launch()
                try:
                    run_all(engine, browser, url)
                finally:
                    browser.close()
    finally:
        srv.shutdown()
    print(f"\n{'ALL PASS' if not FAILS else str(len(FAILS)) + ' FAILED: ' + ', '.join(FAILS)}"
          f"   (screenshots in {OUT})")
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())

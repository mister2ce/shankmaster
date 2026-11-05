"""Round 2 harness: carry checkbox, sortable analytics tables, foursome tables,
Mis Stats. Every number the page shows is recomputed here in Python from the
same fixture, so the two implementations check each other.

Run: ~/work/chief-of-staff/.venv-playwright/bin/python harness/check_round2.py
"""
import sys
from datetime import datetime, timezone

from check_sync import (FOURSOME_ID, MX, OUT, P, Fake, base_data, check, mx_ms, open_app, serve, val,
                        FAILS)
from playwright.sync_api import sync_playwright

PARS = [int(c) for c in "443543454453443444"]


def ronda_full(gid, fecha, diffs, campo="Lomas Country Club", putts=None, fw=None, hoyos=18, dif=None):
    holes = []
    for i in range(hoyos):
        par = PARS[i]
        holes.append({"nr": i + 1, "par": par, "score": par + diffs[i],
                      "putts": (putts[i] if putts else 2), "fairway": (fw[i] if fw else ("HIT" if par > 3 else None))})
    return {"garmin_id": gid, "fecha": fecha, "campo_garmin": campo,
            "campo_ghin": "LOMAS COUNTRY CLUB / LOMAS COUNTRY" if "Lomas" in campo else None,
            "hoyos": hoyos, "gross": sum(h["score"] for h in holes), "ghin_estado": "ya_en_ghin",
            "diferencial": dif, "detalle": {"v": 1, "holes": holes}}


def fixture():
    d = base_data()
    # A: 1 eagle, 2 birdies, 6 pars, 5 bogeys, 2 doubles, 2 triples -> gross 71+11 = 82
    a = [-2, -1, -1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 3, 3]
    b = [1] * 18                                             # course par is 71
    b[0] = 3                                                 # 71+20 = 91
    c = [2] * 18                                             # 107 (A is 82)
    putts_a = [1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, None, 2, 2]
    fw_b = ["HIT" if p > 3 and i % 2 == 0 else ("LEFT" if p > 3 else None) for i, p in enumerate(PARS)]
    d["rondas"] = [
        ronda_full(1, "2026-10-01", a, putts=putts_a, dif=12.5),
        ronda_full(2, "2026-10-05", b, fw=fw_b, dif=18.0),
        ronda_full(3, "2026-10-09", c, campo="Club de Golf Paraíso"),
        ronda_full(4, "2026-10-12", [0] * 9, hoyos=9),
    ]
    # bets: A day (2), B saved a day late (UTC drift), C a foursome
    def bet(pid, fecha_ms, jug, res, imp, **kw):
        base = {"id": pid, "fecha": fecha_ms, "campo": "Lomas Country Club", "jugador_id": jug,
                "jugador_nombre": next(j["nombre"] for j in d["jugadores"] if j["id"] == jug),
                "sliding_usado": "+1", "sliding_anterior": "+1", "sliding_nuevo": "0", "score_mio": 83,
                "score_suyo": 85, "resultado": res, "carry": False, "importe": str(imp), "notas": "",
                "tipo": "individual", "companero_id": None, "rivales_ids": None, "created_at": "2026-10-01T20:00:00Z"}
        base.update(kw)
        return base
    d["partidas"] = [
        bet("b1", mx_ms(2026, 10, 1), P["pepe"], "Ganado", 500, score_mio=83, score_suyo=90),
        bet("b2", mx_ms(2026, 10, 1), P["beto"], "Perdido", 200, score_mio=83, score_suyo=80),
        bet("b3", mx_ms(2026, 10, 6), P["pepe"], "Ganado", 300, score_mio=90, score_suyo=95),
        bet("b4", mx_ms(2026, 10, 9), FOURSOME_ID, "Perdido", 100, score_mio=None, score_suyo=None,
            tipo="foursome", companero_id=P["memo"], rivales_ids=[P["pepe"], P["beto"]]),
        bet("b5", mx_ms(2026, 9, 1), FOURSOME_ID, "Ganado", 50, score_mio=100, score_suyo=100,
            companero_id=P["memo"], rivales_ids=[P["beto"], P["pepe"]], notas="2ce/memo vs beto/pepe"),
        bet("b6", mx_ms(2026, 8, 1), P["pepe"], "Perdido", 150, score_mio=100, score_suyo=100, carry=True),
    ]
    return d


def cells(page, sel):
    return page.locator(sel).first.locator("tbody tr").evaluate_all(
        "trs => trs.map(tr => [...tr.children].map(td => td.textContent.trim()))")


def run(engine, browser, url):
    print(f"\n== {engine} ==")

    # ---- carry checkbox
    d = base_data()
    d["rondas"] = []
    f = Fake(d)
    ctx, page, errors, dialogs = open_app(browser, url, f, datetime(2026, 11, 5, 18, 0, tzinfo=MX), engine)
    page.click('[data-tab="partidas"]'); page.click("#btn-nueva-partida"); page.wait_for_timeout(200)
    check("carry is a checkbox, unchecked by default", page.eval_on_selector("#partida-carry", "e => e.type") == "checkbox"
          and not page.is_checked("#partida-carry"))
    page.select_option("#partida-jugador", P["pepe"])
    page.fill("#partida-score-mio", "90"); page.fill("#partida-score-suyo", "88")
    page.select_option("#partida-resultado", "Perdido"); page.fill("#partida-importe", "100")
    page.check("#partida-carry")
    page.click('#form-partida button[type="submit"]'); page.wait_for_timeout(500)
    post = [w for w in f.writes if w["table"] == "partidas" and w["method"] == "POST"]
    check("checked: saved as carry with sliding frozen", post and post[0]["body"]["carry"] is True
          and post[0]["body"]["sliding_nuevo"] == post[0]["body"]["sliding_anterior"], post)
    check("checked: no sliding PATCH", not any(w["table"] == "jugadores" for w in f.writes), f.writes)
    page.evaluate("editarPartida('p1')"); page.wait_for_timeout(200)
    check("edit of a non-carry bet shows it unchecked", not page.is_checked("#partida-carry"))
    ctx.close()

    # ---- analytics tables
    d = fixture()
    f = Fake(d)
    ctx, page, errors, dialogs = open_app(browser, url, f, datetime(2026, 11, 5, 18, 0, tzinfo=MX), engine)
    page.click('[data-tab="analitica"]'); page.wait_for_timeout(600)
    rows = cells(page, "#tabla-oponentes")
    names = [r[0] for r in rows]
    check("opponents exclude the foursome stand-in", not any(n.startswith("A Foursome") for n in names), names)
    check("opponents sorted by partidas, most first", names[:2] == ["Pepe Ejemplo", "Beto Prueba"], names)
    pepe = rows[0]
    # Pepe: b1 won 500, b3 won 300, b6 lost 150 -> 3 partidas, 2-1, 67%, +$650; scores: b1 (83/90), b3 (90/95); b6 is 100/100 placeholder
    check("Pepe partidas/ganadas/perdidas/%", pepe[1:5] == ["3", "2", "1", "67%"], pepe)
    check("Pepe balance, ganado, perdido, por partida", pepe[5:9] == ["$650", "$800", "$150", "$217"], pepe)
    check("Pepe score averages skip 100-100", pepe[13:15] == ["86.5", "92.5"], pepe)
    page.click("#tabla-oponentes th:has-text('Balance')"); page.wait_for_timeout(100)
    b_desc = [r[5] for r in cells(page, "#tabla-oponentes")]
    page.click("#tabla-oponentes th:has-text('Balance')"); page.wait_for_timeout(100)
    b_asc = [r[5] for r in cells(page, "#tabla-oponentes")]
    check("Balance header sorts high to low, then low to high", b_desc == ["$650", "-$200"] and b_asc == ["-$200", "$650"],
          (b_desc, b_asc))
    comp = cells(page, "#tabla-companeros")
    check("partners: Memo 2 foursomes 1-1", comp and comp[0][0] == "Memo Muestra" and comp[0][1:4] == ["2", "1", "1"], comp)
    par = cells(page, "#tabla-parejas")
    check("rival pairs grouped regardless of order", len(par) == 1 and par[0][0] == "Beto Prueba / Pepe Ejemplo"
          and par[0][1] == "2", par)
    page.screenshot(path=str(OUT / f"{engine}-r2-analitica.png"), full_page=False)
    width = page.evaluate("document.documentElement.scrollWidth")
    check("analytics: page itself does not scroll sideways", width <= 390, width)
    page.click("#tabla-oponentes tbody tr >> nth=0"); page.wait_for_timeout(300)
    check("tapping a row opens the player detail", page.is_visible("#analitica-jugador"))
    check("no console errors (analytics)", not errors, errors)
    ctx.close()

    # ---- Mis Stats
    d = fixture()
    f = Fake(d)
    ctx, page, errors, dialogs = open_app(browser, url, f, datetime(2026, 11, 5, 18, 0, tzinfo=MX), engine)
    tabs_w = page.evaluate("document.querySelector('.nav-tabs').scrollWidth")
    check("four tabs fit at 390px", tabs_w <= 390, tabs_w)
    page.click('[data-tab="stats"]'); page.wait_for_selector("#stats-dist, .stats-seccion", timeout=5000)
    page.wait_for_timeout(500)
    txt = page.inner_text("#stats-contenido")
    # Expected, recomputed: 18-hole rounds 82, 91, 107
    check("rounds of 18 = 3 (+1 of 9)", "Rondas de 18" in txt and "+ 1 de 9 hoyos" in txt, txt[:200])
    check("average 93.3, best 82", "93.3" in txt and "82" in txt, txt[:400])
    dist = {r[0]: r[1] for r in cells(page, ".stats-seccion:has(h3:has-text('Por hoyo')) table")}
    holes = []
    for r in d["rondas"]:
        holes += r["detalle"]["holes"]
    exp = {"Eagle o mejor": 0, "Birdies": 0, "Pares": 0, "Bogeys": 0, "Dobles": 0, "Triples o peor": 0}
    for h in holes:
        x = h["score"] - h["par"]
        k = ("Eagle o mejor" if x <= -2 else "Birdies" if x == -1 else "Pares" if x == 0 else
             "Bogeys" if x == 1 else "Dobles" if x == 2 else "Triples o peor")
        exp[k] += 1
    check("birdie/par/bogey/double/triple counts match", {k: int(v) for k, v in dist.items()} == exp, (dist, exp))
    # fairways: par>3 holes with fairway; A and C all HIT, B alternate; 9-hole round all HIT
    fw = [h for h in holes if h["par"] >= 4 and h["fairway"]]
    fw_pct = round(100 * sum(1 for h in fw if h["fairway"] == "HIT") / len(fw))
    check(f"fairways {fw_pct}%", f"{fw_pct}%" in txt, fw_pct)
    hp = [h for h in holes if h["putts"] is not None]
    gir = round(100 * sum(1 for h in hp if h["score"] - h["putts"] <= h["par"] - 2) / len(hp))
    check(f"GIR {gir}%", f"{gir}%" in txt, gir)
    putts = round(sum(h["putts"] for h in hp) / len(hp) * 18, 1)
    check(f"putts per round {putts}", f"{putts:.1f}" in txt, putts)
    check("holes without putts are disclosed", "1 hoyo sin putts" in txt, txt)
    hoyos = cells(page, ".stats-seccion:has(h3:has-text('Hoyo por hoyo')) table")
    lomas = [h for r in d["rondas"] if "Lomas" in r["campo_garmin"] for h in r["detalle"]["holes"]]
    vs = {}
    for h in lomas:
        vs.setdefault(h["nr"], []).append(h["score"] - h["par"])
    worst = max(sorted(vs), key=lambda n: sum(vs[n]) / len(vs[n]))
    check("hole by hole defaults to the most played course (Lomas), worst first",
          "Hoyo por hoyo: Lomas Country Club" in txt and hoyos and hoyos[0][0] == str(worst), (worst, hoyos[:3]))
    money = {r[0]: r for r in cells(page, ".stats-seccion:has(h3:has-text('Dinero')) table")}
    check("under 90: 1 round, 2 bets, +$300", money["Menos de 90"][1:3] == ["1", "2"] and money["Menos de 90"][6] == "$300", money)
    check("90 to 95: bet saved a day late still counts (+$300)", money["90 a 95"][2] == "1" and money["90 a 95"][6] == "$300", money)
    check("over 95: foursome loss counts (-$100)", money["Más de 95"][6] == "-$100", money)
    page.screenshot(path=str(OUT / f"{engine}-r2-stats.png"), full_page=True)
    opts = page.eval_on_selector_all("#stats-filter-campo option", "os => os.map(o => o.textContent)")
    check("course filter lists courses by rounds played", opts[1].startswith("Lomas") and any("Paraíso" in o or "Paraiso" in o for o in opts), opts)
    page.select_option("#stats-filter-periodo", "r5"); page.wait_for_timeout(200)
    check("last-5 filter still renders", "Resumen" in page.inner_text("#stats-contenido"))
    width = page.evaluate("document.documentElement.scrollWidth")
    check("stats: page itself does not scroll sideways", width <= 390, width)
    check("no console errors (stats)", not errors, errors)
    ctx.close()


def main():
    srv, url = serve()
    try:
        with sync_playwright() as pw:
            for engine in sys.argv[1:] or ["webkit", "chromium"]:
                b = getattr(pw, engine).launch()
                try:
                    run(engine, b, url)
                finally:
                    b.close()
    finally:
        srv.shutdown()
    print(f"\n{'ALL PASS' if not FAILS else str(len(FAILS)) + ' FAILED: ' + ', '.join(FAILS)}")
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())

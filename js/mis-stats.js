// Shankmaster: Mis Stats (2026-11-05).
//
// Todo sale de la tabla rondas (Garmin, hoyo por hoyo; la llena golf.py) y de
// las partidas para "dinero vs score". Promedios de score sobre rondas de 18
// hoyos; estadísticas por hoyo sobre rondas de 9 y 18. Las rondas parciales
// (8, 12, 13, 14 hoyos) no cuentan.
(function () {
  const cfg = window.SHANKMASTER_SUPABASE;
  if (!cfg || !cfg.url) return;
  const REST = cfg.url.replace(/\/+$/, "") + "/rest/v1/";
  const H = { apikey: cfg.anonKey, Authorization: "Bearer " + cfg.anonKey };
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const S = { rondas: null, charts: [], cargando: null };
  const $ = (id) => document.getElementById(id);

  // ---------------------------------------------------------------- datos
  async function cargar() {
    const r = await fetch(REST + "rondas?select=garmin_id,fecha,campo_garmin,campo_ghin,hoyos,gross," +
      "ghin_estado,diferencial,detalle&order=fecha.asc&limit=5000", { headers: H });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const filas = await r.json();
    return filas
      .filter((x) => x.hoyos === 9 || x.hoyos === 18)
      .map((x) => ({
        ...x,
        holes: ((x.detalle || {}).holes || []).filter((h) => h.score && h.par),
        campo: nombreCampo(x),
        clave: claveCampo(x),
      }))
      .filter((x) => x.holes.length === x.hoyos);
  }
  function titulo(s) { return s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()); }
  function nombreCampo(r) {
    if (r.campo_ghin) return titulo(r.campo_ghin.split("/")[0].trim());
    return (r.campo_garmin || "Sin campo").split("~")[0].trim();
  }
  function claveCampo(r) {
    return (r.campo_garmin || r.campo_ghin || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().split("~")[0].replace(/\b(country club|club de golf|golf course|golf club|golf|club|cc)\b/g, " ")
      .replace(/[^a-z0-9]+/g, "");
  }
  function fechaCorta(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return `${d} ${MESES[m - 1]} ${String(y).slice(2)}`;
  }
  function hoyMX() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
  }
  function fechaMX(ms) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date(ms));
  }
  function sumarDias(iso, n) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  }
  const prom = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  // ---------------------------------------------------------------- filtros
  function filtrar() {
    let rs = S.rondas;
    const campo = $("stats-filter-campo").value;
    if (campo) rs = rs.filter((r) => r.clave === campo);
    const per = $("stats-filter-periodo").value;
    if (per.startsWith("r")) {
      // últimas N rondas de 18 (y las de 9 jugadas en ese mismo lapso)
      const r18 = rs.filter((r) => r.hoyos === 18);
      const n = +per.slice(1);
      const desde = r18.length > n ? r18[r18.length - n].fecha : (r18[0] || {}).fecha;
      if (desde) rs = rs.filter((r) => r.fecha >= desde);
    } else if (per.startsWith("d")) {
      const desde = sumarDias(hoyMX(), -(+per.slice(1)));
      rs = rs.filter((r) => r.fecha >= desde);
    }
    return rs;
  }
  function llenarCampos() {
    const sel = $("stats-filter-campo");
    const actual = sel.value;
    const cuenta = {};
    S.rondas.forEach((r) => { (cuenta[r.clave] = cuenta[r.clave] || { n: 0, nombre: r.campo }).n++; });
    sel.innerHTML = "";
    const todos = document.createElement("option");
    todos.value = "";
    todos.textContent = "Todos los campos";
    sel.appendChild(todos);
    Object.entries(cuenta).sort((a, b) => b[1].n - a[1].n).forEach(([k, v]) => {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = `${v.nombre} (${v.n})`;
      sel.appendChild(o);
    });
    sel.value = actual;
  }

  // ---------------------------------------------------------------- cálculos
  const TIPOS = [
    { k: "eagle", label: "Eagle o mejor", f: (d) => d <= -2 },
    { k: "birdie", label: "Birdies", f: (d) => d === -1 },
    { k: "par", label: "Pares", f: (d) => d === 0 },
    { k: "bogey", label: "Bogeys", f: (d) => d === 1 },
    { k: "doble", label: "Dobles", f: (d) => d === 2 },
    { k: "triple", label: "Triples o peor", f: (d) => d >= 3 },
  ];

  function calcular(rs) {
    const r18 = rs.filter((r) => r.hoyos === 18);
    const hoyos = rs.flatMap((r) => r.holes.map((h) => ({ ...h, fecha: r.fecha })));
    const recientes = (n) => prom(r18.slice(-n).map((r) => r.gross));
    const difs = r18.filter((r) => r.diferencial !== null && r.diferencial !== undefined).map((r) => +r.diferencial);
    const mejor = r18.reduce((m, r) => (!m || r.gross < m.gross ? r : m), null);

    const conFairway = hoyos.filter((h) => h.par >= 4 && h.fairway);
    const fwHit = conFairway.filter((h) => String(h.fairway).toUpperCase() === "HIT").length;
    const conPutts = hoyos.filter((h) => h.putts !== null && h.putts !== undefined);
    const gir = conPutts.filter((h) => h.score - h.putts <= h.par - 2).length;
    const tres = conPutts.filter((h) => h.putts >= 3).length;

    const dist = TIPOS.map((t) => {
      const n = hoyos.filter((h) => t.f(h.score - h.par)).length;
      return { ...t, n, pct: hoyos.length ? (n / hoyos.length) * 100 : 0, porRonda: hoyos.length ? (n / hoyos.length) * 18 : 0 };
    });
    const porPar = [3, 4, 5].map((par) => {
      const hs = hoyos.filter((h) => h.par === par);
      const p = prom(hs.map((h) => h.score));
      return { par, n: hs.length, prom: p, vs: p === null ? null : p - par };
    });
    const ida = prom(r18.map((r) => r.holes.filter((h) => h.nr <= 9).reduce((a, h) => a + h.score, 0)));
    const vuelta = prom(r18.map((r) => r.holes.filter((h) => h.nr >= 10).reduce((a, h) => a + h.score, 0)));
    return {
      r18, n9: rs.length - r18.length, hoyos: hoyos.length,
      promedio: prom(r18.map((r) => r.gross)), mejor,
      ult5: recientes(5), ult10: recientes(10), ult20: recientes(20),
      difProm: prom(difs), difMejor: difs.length ? Math.min(...difs) : null,
      fwPct: conFairway.length ? (fwHit / conFairway.length) * 100 : null, fwHit, fwTot: conFairway.length,
      girPct: conPutts.length ? (gir / conPutts.length) * 100 : null,
      puttsRonda: conPutts.length ? prom(conPutts.map((h) => h.putts)) * 18 : null,
      tresRonda: conPutts.length ? (tres / conPutts.length) * 18 : null,
      hoyosSinPutts: hoyos.length - conPutts.length,
      dist, porPar, ida, vuelta,
    };
  }

  function hoyoPorHoyo(rs, clave) {
    const delCampo = rs.filter((r) => r.clave === clave);
    const filas = {};
    delCampo.forEach((r) => r.holes.forEach((h) => {
      const f = filas[h.nr] || (filas[h.nr] = { hoyo: h.nr, par: h.par, scores: [] });
      f.scores.push(h.score);
    }));
    return Object.values(filas).map((f) => {
      const p = prom(f.scores);
      return {
        hoyo: f.hoyo, par: f.par, veces: f.scores.length, prom: p, vs: p - f.par,
        parOMejor: (f.scores.filter((s) => s <= f.par).length / f.scores.length) * 100,
        dobleOPeor: (f.scores.filter((s) => s >= f.par + 2).length / f.scores.length) * 100,
      };
    });
  }

  // Dinero vs score: las partidas de ese día. Las fechas viejas se guardaron a
  // veces un día después (el error UTC), así que si ese día no hay partidas se
  // miran las del día siguiente, siempre que ese día no tenga ronda propia.
  function dineroVsScore(r18) {
    const partidas = typeof state !== "undefined" ? state.partidas : [];
    const porDia = {};
    partidas.forEach((p) => { if (p.fecha) (porDia[fechaMX(p.fecha)] = porDia[fechaMX(p.fecha)] || []).push(p); });
    const fechasRonda = new Set(S.rondas.map((r) => r.fecha));
    const rangos = [
      { k: "a", label: "Menos de 90", f: (g) => g < 90 },
      { k: "b", label: "90 a 95", f: (g) => g >= 90 && g <= 95 },
      { k: "c", label: "Más de 95", f: (g) => g > 95 },
    ].map((x) => ({ ...x, rondas: 0, partidas: 0, ganadas: 0, perdidas: 0, balance: 0 }));
    r18.forEach((r) => {
      const sig = sumarDias(r.fecha, 1);
      const ps = porDia[r.fecha] || (!fechasRonda.has(sig) ? porDia[sig] : null) || [];
      const rango = rangos.find((x) => x.f(r.gross));
      rango.rondas++;
      ps.forEach((p) => {
        const imp = parseFloat(p.importe) || 0;
        rango.partidas++;
        if (p.resultado === "Ganado") { rango.ganadas++; rango.balance += imp; } else { rango.perdidas++; rango.balance -= imp; }
      });
    });
    return rangos.map((x) => ({ ...x, pct: x.partidas ? (x.ganadas / x.partidas) * 100 : null,
      porRonda: x.rondas ? x.balance / x.rondas : null }));
  }

  // ---------------------------------------------------------------- pintar
  function el(tag, cls, texto) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }
  function tarjeta(label, valor, sub) {
    const c = el("div", "stat-mini");
    c.appendChild(el("div", "stat-mini-valor", valor));
    c.appendChild(el("div", "stat-mini-label", label));
    if (sub) c.appendChild(el("div", "stat-mini-sub", sub));
    return c;
  }
  const d1 = (v) => (v === null || v === undefined ? "-" : v.toFixed(1));
  const pc = (v) => (v === null || v === undefined ? "-" : Math.round(v) + "%");
  const sg = (v) => (v === null || v === undefined ? "-" : (v > 0 ? "+" : "") + v.toFixed(2));

  function seccion(cont, tituloTxt) {
    const s = el("div", "stats-seccion");
    s.appendChild(el("h3", "", tituloTxt));
    cont.appendChild(s);
    return s;
  }

  function pintar() {
    S.charts.forEach((c) => c.destroy());
    S.charts = [];
    const cont = $("stats-contenido");
    cont.innerHTML = "";
    const rs = filtrar();
    if (!rs.length) {
      cont.appendChild(el("p", "tabla-ayuda", "No hay rondas para estos filtros."));
      return;
    }
    const c = calcular(rs);
    const T = window.tablas;

    // Resumen
    const res = seccion(cont, "Resumen");
    const grid = el("div", "stats-mini-grid");
    grid.appendChild(tarjeta("Rondas de 18", String(c.r18.length), c.n9 ? `+ ${c.n9} de 9 hoyos` : ""));
    grid.appendChild(tarjeta("Promedio", d1(c.promedio)));
    grid.appendChild(tarjeta("Mejor ronda", c.mejor ? String(c.mejor.gross) : "-",
      c.mejor ? `${fechaCorta(c.mejor.fecha)} · ${c.mejor.campo}` : ""));
    grid.appendChild(tarjeta("Últimas 5", d1(c.ult5)));
    grid.appendChild(tarjeta("Últimas 10", d1(c.ult10)));
    grid.appendChild(tarjeta("Últimas 20", d1(c.ult20)));
    grid.appendChild(tarjeta("Diferencial prom.", d1(c.difProm), "rondas en GHIN"));
    grid.appendChild(tarjeta("Mejor diferencial", d1(c.difMejor)));
    res.appendChild(grid);

    // Tendencia
    if (c.r18.length >= 2 && window.Chart) {
      const sec = seccion(cont, "Tendencia (rondas de 18)");
      const box = el("div", "stats-chart");
      const cv = document.createElement("canvas");
      box.appendChild(cv);
      sec.appendChild(box);
      const etiquetas = c.r18.map((r) => fechaCorta(r.fecha));
      const gross = c.r18.map((r) => r.gross);
      const media = gross.map((_, i) => (i < 4 ? null : prom(gross.slice(i - 4, i + 1))));
      const difs = c.r18.map((r) => (r.diferencial === null || r.diferencial === undefined ? null : +r.diferencial));
      S.charts.push(new Chart(cv, {
        type: "line",
        data: { labels: etiquetas, datasets: [
          { label: "Score", data: gross, borderColor: "#7FCCA8", backgroundColor: "#7FCCA8", pointRadius: 2, borderWidth: 1, tension: 0 },
          { label: "Promedio 5 rondas", data: media, borderColor: "#D4AF37", pointRadius: 0, borderWidth: 2, tension: 0.3 },
          { label: "Diferencial", data: difs, borderColor: "#9CA3AF", pointRadius: 2, borderWidth: 1, borderDash: [4, 3], yAxisID: "y2", spanGaps: true },
        ] },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
          plugins: { legend: { labels: { color: "#ccc", boxWidth: 12 } } },
          scales: { x: { ticks: { color: "#999", maxTicksLimit: 6 } }, y: { ticks: { color: "#999" }, title: { display: true, text: "Score", color: "#999" } },
            y2: { position: "right", grid: { drawOnChartArea: false }, ticks: { color: "#999" }, title: { display: true, text: "Diferencial", color: "#999" } } } },
      }));
    }

    // Distribución de scores
    const dsec = seccion(cont, "Por hoyo: birdies, pares, bogeys...");
    const dtabla = el("div");
    dsec.appendChild(dtabla);
    T.tablaOrdenable(dtabla, "stats-dist", [
      { key: "label", label: "Resultado", tipo: "texto", ver: (f) => f.label },
      { key: "n", label: "Total", tipo: "num" },
      { key: "porRonda", label: "Por ronda", tipo: "num", ver: (f) => d1(f.porRonda) },
      { key: "pct", label: "% de hoyos", tipo: "num", ver: (f) => pc(f.pct) },
    ], c.dist.map((x, i) => ({ ...x, orden: i })), { orden: "orden", dir: "asc" });
    dsec.appendChild(el("p", "tabla-ayuda", `${c.hoyos} hoyos jugados. "Por ronda" es por cada 18 hoyos.`));

    // Tee to green
    const tsec = seccion(cont, "Del tee al green");
    const tg = el("div", "stats-mini-grid");
    tg.appendChild(tarjeta("Fairways", pc(c.fwPct), `${c.fwHit} de ${c.fwTot}`));
    tg.appendChild(tarjeta("Greens en regulación", pc(c.girPct)));
    tg.appendChild(tarjeta("Putts por ronda", d1(c.puttsRonda)));
    tg.appendChild(tarjeta("3 putts por ronda", d1(c.tresRonda)));
    tsec.appendChild(tg);
    if (c.hoyosSinPutts) {
      tsec.appendChild(el("p", "tabla-ayuda",
        `${c.hoyosSinPutts} ${c.hoyosSinPutts === 1 ? "hoyo" : "hoyos"} sin putts en Garmin no cuentan para greens ni putts.`));
    }

    // Par 3/4/5 e ida/vuelta
    const psec = seccion(cont, "Pares 3, 4 y 5 · Ida y vuelta");
    const pg = el("div", "stats-mini-grid");
    c.porPar.forEach((x) => pg.appendChild(tarjeta(`Par ${x.par}`, d1(x.prom), `${sg(x.vs)} vs par · ${x.n} hoyos`)));
    pg.appendChild(tarjeta("Ida (1 a 9)", d1(c.ida)));
    pg.appendChild(tarjeta("Vuelta (10 a 18)", d1(c.vuelta)));
    psec.appendChild(pg);

    // Hoyo por hoyo
    const campoSel = $("stats-filter-campo").value;
    const masJugado = (() => {
      const n = {};
      rs.forEach((r) => { n[r.clave] = (n[r.clave] || 0) + 1; });
      return Object.entries(n).sort((a, b) => b[1] - a[1])[0][0];
    })();
    const clave = campoSel || masJugado;
    const nombre = (rs.find((r) => r.clave === clave) || {}).campo || "";
    const hsec = seccion(cont, `Hoyo por hoyo: ${nombre}`);
    const htabla = el("div");
    hsec.appendChild(htabla);
    T.tablaOrdenable(htabla, "stats-hoyos", [
      { key: "hoyo", label: "Hoyo", tipo: "num" },
      { key: "par", label: "Par", tipo: "num" },
      { key: "prom", label: "Promedio", tipo: "num", ver: (f) => d1(f.prom) },
      { key: "vs", label: "vs par", tipo: "num", ver: (f) => sg(f.vs) },
      { key: "parOMejor", label: "Par o mejor", tipo: "num", ver: (f) => pc(f.parOMejor) },
      { key: "dobleOPeor", label: "Doble o peor", tipo: "num", ver: (f) => pc(f.dobleOPeor) },
      { key: "veces", label: "Veces", tipo: "num" },
    ], hoyoPorHoyo(rs, clave), { orden: "vs", dir: "desc" });
    hsec.appendChild(el("p", "tabla-ayuda", "Ordenada por los hoyos que más te cuestan. Elige un campo arriba para ver otro."));

    // Dinero vs score
    const msec = seccion(cont, "Dinero vs score (rondas de 18)");
    const mtabla = el("div");
    msec.appendChild(mtabla);
    T.tablaOrdenable(mtabla, "stats-dinero", [
      { key: "label", label: "Score", tipo: "texto", ver: (f) => f.label },
      { key: "rondas", label: "Rondas", tipo: "num" },
      { key: "partidas", label: "Partidas", tipo: "num" },
      { key: "ganadas", label: "Ganadas", tipo: "num" },
      { key: "perdidas", label: "Perdidas", tipo: "num" },
      { key: "pct", label: "% ganadas", tipo: "num", ver: (f) => pc(f.pct) },
      { key: "balance", label: "Balance", tipo: "num", ver: (f) => T.fmt.dinero(f.balance), clase: (f) => T.claseDinero(f.balance) },
      { key: "porRonda", label: "$ por ronda", tipo: "num", ver: (f) => T.fmt.dinero(f.porRonda), clase: (f) => T.claseDinero(f.porRonda) },
    ], dineroVsScore(c.r18).map((x, i) => ({ ...x, orden: i })), { orden: "orden", dir: "asc" });
  }

  async function mostrar() {
    const cont = $("stats-contenido");
    try {
      if (!S.cargando) S.cargando = cargar();
      S.rondas = await S.cargando;
      S.cargando = null;  // la próxima vez que se abra, se vuelve a leer (después de un sync)
      llenarCampos();
      pintar();
    } catch (e) {
      S.cargando = null;
      cont.innerHTML = "";
      cont.appendChild(el("p", "sync-mensaje", "No se pudieron leer tus rondas: " + e.message));
    }
  }

  function init() {
    $("stats-filter-campo").addEventListener("change", pintar);
    $("stats-filter-periodo").addEventListener("change", pintar);
  }

  window.misStats = { mostrar, _calc: { calcular, hoyoPorHoyo, dineroVsScore, filtrar }, _estado: S };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

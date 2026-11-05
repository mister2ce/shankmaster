// Shankmaster: tablas ordenables de Analítica (2026-11-05).
//
// - "Contra quién juego": una fila por contrincante, todas las columnas que
//   pidió, ordenable tocando el encabezado (otra vez invierte). Abre ordenada
//   por número de partidas.
// - Foursome: compañeros y parejas rivales (de companero_id / rivales_ids).
// - window.tablas.tablaOrdenable también la usa js/mis-stats.js.
// Todo el texto se pone con textContent: los nombres nunca se leen como HTML.
(function () {
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const esComodin = (nombre) => /^A Foursome\b/.test(nombre || "");
  const estadoOrden = {};  // id de tabla -> { key, dir }

  // ---------------------------------------------------------------- formatos
  const fmt = {
    num: (v) => (v === null || v === undefined || Number.isNaN(v) ? "-" : String(v)),
    dec1: (v) => (v === null || v === undefined || Number.isNaN(v) ? "-" : v.toFixed(1)),
    pct: (v) => (v === null || v === undefined || Number.isNaN(v) ? "-" : Math.round(v) + "%"),
    dinero: (v) => {
      if (v === null || v === undefined || Number.isNaN(v)) return "-";
      const s = Math.abs(Math.round(v)).toLocaleString("es-MX");
      return (v < 0 ? "-$" : "$") + s;
    },
    signo: (v) => (v === null || v === undefined || Number.isNaN(v) ? "-" : v > 0 ? "+" + v : String(v)),
    fecha: (ms) => {
      if (!ms) return "-";
      const d = new Date(ms);
      const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(d).split("-");
      return `${+p[2]} ${MESES[+p[1] - 1]} ${p[0].slice(2)}`;
    },
  };
  const claseDinero = (v) => (v > 0 ? "importe-positivo" : v < 0 ? "importe-negativo" : "");

  // ---------------------------------------------------------------- tabla genérica
  // columnas: [{ key, label, tipo: "num"|"texto", ver(fila) -> texto, clase(fila) -> clase }]
  function tablaOrdenable(contenedor, id, columnas, filas, opciones = {}) {
    const el = typeof contenedor === "string" ? document.getElementById(contenedor) : contenedor;
    if (!el) return;
    el.innerHTML = "";
    if (!filas.length) {
      const p = document.createElement("p");
      p.className = "tabla-ayuda";
      p.textContent = opciones.vacio || "Sin datos para estos filtros.";
      el.appendChild(p);
      return;
    }
    const orden = estadoOrden[id] || (estadoOrden[id] = { key: opciones.orden || columnas[1].key,
      dir: opciones.dir || "desc" });
    // La clave de orden puede ser un campo que no se muestra (p. ej. el orden natural de las filas).
    const col = columnas.find((c) => c.key === orden.key) || { key: orden.key, tipo: "num" };
    const valor = (f) => f[col.key];
    const ordenadas = [...filas].sort((a, b) => {
      const va = valor(a), vb = valor(b);
      const vacioA = va === null || va === undefined || (typeof va === "number" && Number.isNaN(va));
      const vacioB = vb === null || vb === undefined || (typeof vb === "number" && Number.isNaN(vb));
      if (vacioA || vacioB) return vacioA === vacioB ? 0 : vacioA ? 1 : -1;  // vacíos siempre al final
      const r = col.tipo === "texto" ? String(va).localeCompare(String(vb), "es", { sensitivity: "base" })
        : va - vb;
      return orden.dir === "asc" ? r : -r;
    });

    const wrap = document.createElement("div");
    wrap.className = "tabla-scroll";
    const t = document.createElement("table");
    t.className = "tabla-ordenable";
    const tr = document.createElement("tr");
    columnas.forEach((c, i) => {
      const th = document.createElement("th");
      th.textContent = c.label + (c.key === orden.key ? (orden.dir === "asc" ? " ▲" : " ▼") : "");
      if (i === 0) th.className = "fija";
      th.addEventListener("click", () => {
        if (orden.key === c.key) orden.dir = orden.dir === "asc" ? "desc" : "asc";
        else { orden.key = c.key; orden.dir = c.tipo === "texto" ? "asc" : "desc"; }
        tablaOrdenable(el, id, columnas, filas, opciones);
      });
      tr.appendChild(th);
    });
    const thead = document.createElement("thead");
    thead.appendChild(tr);
    t.appendChild(thead);
    const tbody = document.createElement("tbody");
    ordenadas.forEach((f) => {
      const fila = document.createElement("tr");
      if (opciones.alTocar) {
        fila.style.cursor = "pointer";
        fila.addEventListener("click", () => opciones.alTocar(f));
      }
      columnas.forEach((c, i) => {
        const td = document.createElement("td");
        td.textContent = c.ver ? c.ver(f) : fmt.num(f[c.key]);
        const cls = [i === 0 ? "fija" : "", c.clase ? c.clase(f) : ""].filter(Boolean).join(" ");
        if (cls) td.className = cls;
        fila.appendChild(td);
      });
      tbody.appendChild(fila);
    });
    t.appendChild(tbody);
    wrap.appendChild(t);
    el.appendChild(wrap);
  }

  // ---------------------------------------------------------------- cálculos
  const importe = (p) => parseFloat(p.importe) || 0;
  const neto = (p) => (p.resultado === "Ganado" ? importe(p) : -importe(p));
  const jugadorPorId = (id) => state.jugadores.find((j) => j.id === id);
  const nombreDe = (id, fallback) => (jugadorPorId(id) || {}).nombre || fallback || "?";

  function acumular(grupos, clave, p, extra) {
    const g = grupos[clave] || (grupos[clave] = { partidas: 0, ganadas: 0, perdidas: 0, balance: 0,
      ganado: 0, perdido: 0, ultima: 0, primera: Infinity, misScores: [], susScores: [], ...extra });
    g.partidas++;
    if (p.resultado === "Ganado") { g.ganadas++; g.ganado += importe(p); } else { g.perdidas++; g.perdido += importe(p); }
    g.balance += neto(p);
    g.ultima = Math.max(g.ultima, p.fecha || 0);
    g.primera = Math.min(g.primera, p.fecha || Infinity);
    return g;
  }
  function cerrar(g) {
    g.pct = g.partidas ? (g.ganadas / g.partidas) * 100 : null;
    g.porPartida = g.partidas ? g.balance / g.partidas : null;
    if (g.primera === Infinity) g.primera = null;
    const prom = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    g.miProm = prom(g.misScores);
    g.suProm = prom(g.susScores);
    return g;
  }
  const esScoreReal = (p) => p.tipo !== "foursome" && !esComodin(p.jugador_nombre) &&
    Number.isFinite(p.score_mio) && Number.isFinite(p.score_suyo) && !(p.score_mio === 100 && p.score_suyo === 100);

  function oponentes(partidas) {
    const g = {};
    partidas.filter((p) => !esComodin(p.jugador_nombre) && p.tipo !== "foursome").forEach((p) => {
      const j = jugadorPorId(p.jugador_id);
      const fila = acumular(g, p.jugador_id, p, { id: p.jugador_id, nombre: nombreDe(p.jugador_id, p.jugador_nombre) });
      if (esScoreReal(p)) { fila.misScores.push(p.score_mio); fila.susScores.push(p.score_suyo); }
      if (j) {
        const actual = parseSliding(j.sliding_actual || j.sliding_inicial);
        const inicial = parseSliding(j.sliding_inicial);
        fila.sliding = actual;
        fila.movido = Number.isFinite(actual) && Number.isFinite(inicial) ? actual - inicial : null;
      }
    });
    return Object.values(g).map(cerrar);
  }

  function companeros(partidas) {
    const g = {};
    partidas.filter((p) => p.companero_id).forEach((p) =>
      acumular(g, p.companero_id, p, { id: p.companero_id, nombre: nombreDe(p.companero_id) }));
    return Object.values(g).map(cerrar);
  }

  function parejas(partidas) {
    const g = {};
    partidas.filter((p) => Array.isArray(p.rivales_ids) && p.rivales_ids.filter(Boolean).length === 2)
      .forEach((p) => {
        const ids = [...p.rivales_ids].sort();
        const nombres = ids.map((id) => nombreDe(id)).sort((a, b) => a.localeCompare(b, "es"));
        acumular(g, ids.join("|"), p, { nombre: nombres.join(" / ") });
      });
    return Object.values(g).map(cerrar);
  }

  // ---------------------------------------------------------------- columnas
  const COLS_DINERO = [
    { key: "partidas", label: "Partidas", tipo: "num" },
    { key: "ganadas", label: "Ganadas", tipo: "num" },
    { key: "perdidas", label: "Perdidas", tipo: "num" },
    { key: "pct", label: "% ganadas", tipo: "num", ver: (f) => fmt.pct(f.pct) },
    { key: "balance", label: "Balance", tipo: "num", ver: (f) => fmt.dinero(f.balance), clase: (f) => claseDinero(f.balance) },
  ];
  const COLS_OPONENTES = [
    { key: "nombre", label: "Jugador", tipo: "texto", ver: (f) => f.nombre },
    ...COLS_DINERO,
    { key: "ganado", label: "Ganado", tipo: "num", ver: (f) => fmt.dinero(f.ganado) },
    { key: "perdido", label: "Perdido", tipo: "num", ver: (f) => fmt.dinero(f.perdido) },
    { key: "porPartida", label: "$ por partida", tipo: "num", ver: (f) => fmt.dinero(f.porPartida), clase: (f) => claseDinero(f.porPartida) },
    { key: "sliding", label: "Sliding", tipo: "num", ver: (f) => (f.sliding === undefined ? "-" : formatSliding(f.sliding)) },
    { key: "movido", label: "Se movió", tipo: "num", ver: (f) => fmt.signo(f.movido) },
    { key: "ultima", label: "Última", tipo: "num", ver: (f) => fmt.fecha(f.ultima) },
    { key: "primera", label: "Primera", tipo: "num", ver: (f) => fmt.fecha(f.primera) },
    { key: "miProm", label: "Mi score prom.", tipo: "num", ver: (f) => fmt.dec1(f.miProm) },
    { key: "suProm", label: "Su score prom.", tipo: "num", ver: (f) => fmt.dec1(f.suProm) },
  ];
  const COLS_FOURSOME = (titulo) => [
    { key: "nombre", label: titulo, tipo: "texto", ver: (f) => f.nombre },
    ...COLS_DINERO,
    { key: "porPartida", label: "$ por partida", tipo: "num", ver: (f) => fmt.dinero(f.porPartida), clase: (f) => claseDinero(f.porPartida) },
    { key: "ultima", label: "Última", tipo: "num", ver: (f) => fmt.fecha(f.ultima) },
  ];

  function renderAnalitica(partidas) {
    tablaOrdenable("tabla-oponentes", "oponentes", COLS_OPONENTES, oponentes(partidas),
      { orden: "partidas", alTocar: (f) => mostrarDetalleJugador(f.id) });
    tablaOrdenable("tabla-companeros", "companeros", COLS_FOURSOME("Compañero"), companeros(partidas),
      { orden: "partidas", vacio: "Sin foursomes con compañero registrado en estos filtros." });
    tablaOrdenable("tabla-parejas", "parejas", COLS_FOURSOME("Pareja rival"), parejas(partidas),
      { orden: "partidas", vacio: "Sin foursomes con pareja rival registrada en estos filtros." });
  }

  window.tablas = { tablaOrdenable, renderAnalitica, fmt, claseDinero, _calc: { oponentes, companeros, parejas } };
})();

// Shankmaster: sincronización Garmin -> GHIN -> Shankmaster, y foursomes.
// (2026-11-05)
//
// - El ícono ↻ del encabezado llama a la función golf-sync de Supabase, que
//   arranca el trabajo privado en GitHub (golf.py). Aquí solo se muestra el
//   avance leyendo sync_runs, y al terminar se recargan las rondas.
// - Nueva partida: la fecha, el campo y "Mi score" salen de la ronda de Garmin
//   de ese día. Lo que escribas a mano gana. Las partidas guardadas nunca se
//   tocan.
// - Foursome: compañero y dos rivales de la lista de jugadores, sin score y
//   sin ventaja; ningún sliding se mueve.
(function () {
  const cfg = window.SHANKMASTER_SUPABASE;
  if (!cfg || !cfg.url) return;
  const BASE = cfg.url.replace(/\/+$/, "");
  const REST = BASE + "/rest/v1/";
  const FN = BASE + "/functions/v1/golf-sync";
  const H = { apikey: cfg.anonKey, Authorization: "Bearer " + cfg.anonKey };
  const FOURSOME = "A Foursome y Otros";
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const POLL_MS = 2000;
  const STALE_MS = 15 * 60 * 1000;
  const DIAS_DEFAULT = 3;          // la fecha por defecto mira rondas de hasta 3 días atrás
  const HORAS_DIA_CERRADO = 12;    // un día con partidas guardadas hace más de 12 h ya se registró

  const $ = (id) => document.getElementById(id);
  const S = { rondas: [], runId: null, timer: null, autoScore: null, tipo: "individual", editando: false };

  async function leer(path) {
    const r = await fetch(REST + path, { headers: H });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  // ---------------------------------------------------------------- fechas
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
  function fechaCorta(iso) {
    const [, m, d] = String(iso).split("-").map(Number);
    return `${d} ${MESES[m - 1]}`;
  }

  // ---------------------------------------------------------------- campos
  function norm(s) {
    return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split("~")[0]
      .replace(/\b(country club|golf club|golf course|club de golf|club campestre|campestre|golf|club|cc|c c|the|de|la|el)\b/g, " ")
      .replace(/[^a-z0-9]+/g, "");
  }
  function titulo(s) {
    return s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  }
  function campoDeRonda(r) {
    const opciones = [...$("partida-campo-select").options].map((o) => o.value)
      .filter((v) => v && v !== "__nuevo__");
    const objetivos = [r.campo_garmin, (r.campo_ghin || "").split("/")[0]].map(norm).filter(Boolean);
    const hit = opciones.find((o) => objetivos.includes(norm(o)));
    if (hit) return { existe: true, nombre: hit };
    const nombre = (r.campo_ghin ? titulo(r.campo_ghin.split("/")[0].trim())
      : (r.campo_garmin || "").split("~")[0].trim()).replace(/[<>&"'`]/g, "");  // va a innerHTML en app.js
    return { existe: false, nombre };
  }
  function ponerCampo(c) {
    const sel = $("partida-campo-select");
    const nuevo = $("partida-campo-nuevo");
    if (c.existe) {
      sel.value = c.nombre;
      nuevo.style.display = "none";
      nuevo.required = false;
      nuevo.value = "";
    } else {
      sel.value = "__nuevo__";
      nuevo.style.display = "block";
      nuevo.required = true;
      nuevo.value = c.nombre;
    }
  }

  // ---------------------------------------------------------------- rondas en el formulario
  async function cargarRondas() {
    try {
      S.rondas = await leer("rondas?select=garmin_id,fecha,campo_garmin,campo_ghin,gross,hoyos," +
        "ghin_estado,diferencial&order=fecha.desc&limit=200");
    } catch (e) {
      console.warn("[golf-sync] no se pudieron leer las rondas", e);
    }
  }

  function descRonda(r) {
    const ghin = { publicado: "GHIN ✓", ya_en_ghin: "GHIN ✓", pendiente: "GHIN pendiente",
      fallo: "GHIN con error" }[r.ghin_estado] || "";
    return `${fechaCorta(r.fecha)} · ${campoDeRonda(r).nombre} · ${r.gross}` +
      `${r.hoyos === 9 ? " (9 hoyos)" : ""}${ghin ? " · " + ghin : ""}`;
  }

  function chip(texto, vacio) {
    const c = $("ronda-chip");
    c.className = "ronda-chip" + (vacio ? " vacio" : "");
    c.textContent = texto;
    c.hidden = false;
    return c;
  }

  function usarRonda(r) {
    const sc = $("partida-score-mio");
    if (S.tipo === "individual" &&
        (sc.value === "" || (S.autoScore !== null && sc.value === String(S.autoScore)))) {
      sc.value = r.gross;
      S.autoScore = r.gross;
    }
    ponerCampo(campoDeRonda(r));  // Garmin manda en el campo (su regla)
    chip("Garmin: " + descRonda(r));
  }

  // abriendo = true cuando lo llama alAbrirFormulario: app.js todavía no muestra
  // el formulario en ese momento.
  function aplicarFecha(abriendo) {
    if (S.editando) return;
    if (abriendo !== true && $("form-partida-container").style.display === "none") return;
    const fecha = $("partida-fecha").value;
    const rs = S.rondas.filter((r) => r.fecha === fecha);
    if (rs.length === 1) return usarRonda(rs[0]);
    // Sin ronda (o varias): quitar solo lo que llenó Garmin, nunca lo escrito a mano.
    const sc = $("partida-score-mio");
    if (S.autoScore !== null && sc.value === String(S.autoScore)) sc.value = "";
    S.autoScore = null;
    if (!rs.length) {
      chip(S.rondas.length ? "Sin ronda de Garmin en esta fecha. Si ya jugaste, toca ↻ arriba."
        : "Todavía no hay rondas de Garmin. Toca ↻ arriba para sincronizar.", true);
      return;
    }
    const c = chip("Hay " + rs.length + " rondas de Garmin este día. ¿Cuál fue?");
    rs.forEach((r) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ronda-opcion";
      b.textContent = descRonda(r);
      b.onclick = () => usarRonda(r);
      c.appendChild(b);
    });
  }

  // La fecha por defecto es la de tu ronda más reciente de Garmin (hasta 3 días
  // atrás) mientras ese día siga abierto: sin partidas, o con partidas
  // guardadas hace menos de 12 horas. Si no, hoy.
  function fechaPorDefecto() {
    const hoy = hoyMX();
    const limite = sumarDias(hoy, -DIAS_DEFAULT);
    const r = S.rondas.filter((x) => x.fecha <= hoy && x.fecha >= limite)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0];
    if (!r || r.fecha === hoy) return hoy;
    const delDia = (typeof state !== "undefined" ? state.partidas : [])
      .filter((p) => p.fecha && fechaMX(p.fecha) === r.fecha);
    if (!delDia.length) return r.fecha;
    const ultima = Math.max(...delDia.map((p) => Date.parse(p.created_at) || 0));
    return Date.now() - ultima < HORAS_DIA_CERRADO * 3600 * 1000 ? r.fecha : hoy;
  }

  // ---------------------------------------------------------------- foursome
  function jugadoresOrdenados() {
    return (typeof state !== "undefined" ? state.jugadores : [])
      .filter((j) => !/^A Foursome\b/.test(j.nombre))  // los jugadores comodín de foursome
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
  }
  function llenarSelectsFoursome() {
    const lista = jugadoresOrdenados();
    ["foursome-companero", "foursome-rival1", "foursome-rival2"].forEach((id) => {
      const sel = $(id);
      const actual = sel.value;
      sel.innerHTML = "";
      const vacio = document.createElement("option");
      vacio.value = "";
      vacio.textContent = "Seleccione un jugador";
      sel.appendChild(vacio);
      lista.forEach((j) => {
        const o = document.createElement("option");
        o.value = j.id;
        o.textContent = j.nombre;
        sel.appendChild(o);
      });
      sel.value = actual;
    });
  }
  function jugadorFoursome() {
    return (typeof state !== "undefined" ? state.jugadores : []).find((j) => j.nombre === FOURSOME);
  }

  function ponerTipo(tipo) {
    S.tipo = tipo;
    $("partida-tipo").value = tipo;
    document.querySelectorAll(".tipo-btn").forEach((b) => b.classList.toggle("active", b.dataset.tipo === tipo));
    const f = tipo === "foursome";
    $("foursome-section").hidden = !f;
    $("scores-section").hidden = f;
    $("grupo-contrincante").hidden = f;
    $("partida-score-mio").required = !f;
    $("partida-score-suyo").required = !f;
    ["foursome-companero", "foursome-rival1", "foursome-rival2"].forEach((id) => { $(id).required = f; });
    const sel = $("partida-jugador");
    if (f) {
      llenarSelectsFoursome();
      const fj = jugadorFoursome();
      if (fj) sel.value = fj.id;
      $("sliding-actual-card").style.display = "none";
    } else if (!S.editando && sel.value && jugadorFoursome() && sel.value === jugadorFoursome().id) {
      // Solo en una partida nueva. Al editar una vieja contra el jugador
      // comodín, todo queda como se guardó.
      sel.value = "";
      $("sliding-actual-card").style.display = "none";
    }
  }

  function lineaFoursome(c, r1, r2) {
    const n = (id) => ((state.jugadores.find((j) => j.id === id) || {}).nombre || "?");
    return `2ce/${n(c)} vs ${n(r1)}/${n(r2)}`;
  }

  // Lo llama guardarPartida (app.js). null = partida individual.
  function datosFoursome() {
    if (S.tipo !== "foursome") return null;
    if (!jugadorFoursome()) return { error: `Falta el jugador "${FOURSOME}" en la lista de jugadores.` };
    const c = $("foursome-companero").value;
    const r1 = $("foursome-rival1").value;
    const r2 = $("foursome-rival2").value;
    if (!c || !r1 || !r2) return { error: "Elige a tu compañero y a los dos rivales." };
    if (new Set([c, r1, r2]).size < 3) return { error: "Un jugador no puede estar dos veces en el foursome." };
    const extra = $("partida-notas").value.trim();
    return {
      companero_id: c,
      rivales_ids: [r1, r2],
      notas: lineaFoursome(c, r1, r2) + (extra ? "\n" + extra : ""),
    };
  }

  // Lo llama mostrarFormularioPartida (app.js) al abrir el formulario.
  function alAbrirFormulario(partida) {
    S.editando = !!partida;
    S.autoScore = null;
    $("ronda-chip").hidden = true;
    if (partida) {
      const f = partida.tipo === "foursome";
      ponerTipo(f ? "foursome" : "individual");
      if (f) {
        $("foursome-companero").value = partida.companero_id || "";
        $("foursome-rival1").value = (partida.rivales_ids || [])[0] || "";
        $("foursome-rival2").value = (partida.rivales_ids || [])[1] || "";
        // En notas solo queda lo que escribiste; la línea de parejas se rehace al guardar.
        const notas = partida.notas || "";
        const linea = lineaFoursome(partida.companero_id, ...(partida.rivales_ids || []));
        $("partida-notas").value = notas.startsWith(linea) ? notas.slice(linea.length).trim() : notas;
      }
      return;
    }
    ponerTipo("individual");
    $("partida-fecha").value = fechaPorDefecto();
    aplicarFecha(true);
  }

  // ---------------------------------------------------------------- sincronización
  function panel(visible) { $("sync-panel").hidden = !visible; }

  function campoCorto(c) {
    return c ? titulo(String(c).split("/")[0].trim()) : "";
  }

  function pintar(run) {
    const fin = run.estado === "done" || run.estado === "failed";
    const fill = $("sync-barra-fill");
    fill.className = "sync-barra-fill";
    fill.style.width = "";
    if (run.estado === "failed") fill.classList.add("error");
    else if (run.estado === "done") fill.style.width = "100%";
    else if (!run.etapa) fill.classList.add("esperando");
    else fill.style.width = Math.max(8, Math.round((run.etapa / 5) * 100)) + "%";
    $("sync-titulo").textContent = run.estado === "done" ? "Listo"
      : run.estado === "failed" ? "No se completó" : "Sincronizando";
    $("sync-etapa").textContent = fin ? "" : (run.etapa_texto || "Iniciando") + "…";
    const msg = $("sync-mensaje");
    msg.hidden = !run.mensaje;
    msg.textContent = run.mensaje || "";

    const ul = $("sync-resultados");
    ul.innerHTML = "";
    const res = run.resultados || [];
    const iguales = res.filter((x) => x.marca === "=").length;
    const add = (texto, clase) => {
      const li = document.createElement("li");
      if (clase) li.className = clase;
      li.textContent = texto;
      ul.appendChild(li);
    };
    res.filter((x) => x.marca !== "=").forEach((x) => {
      const ok = x.marca === "✓";
      const li = document.createElement("li");
      li.className = ok ? "ok" : (x.marca === "-" ? "" : "mal");
      const m = document.createElement("span");
      m.className = "marca";
      m.textContent = x.marca;
      li.appendChild(m);
      li.appendChild(document.createTextNode(
        `${fechaCorta(x.fecha)} · ${campoCorto(x.campo)}${x.gross ? " · " + x.gross : ""} · ${x.texto}`));
      ul.appendChild(li);
    });
    if (fin && iguales) add(`${iguales} ${iguales === 1 ? "ronda ya estaba" : "rondas ya estaban"} en GHIN.`);
    if (run.estado === "done" && !res.some((x) => x.marca !== "=")) {
      add("Todo al día. No había rondas nuevas.");
    }
  }

  async function iniciarSync() {
    panel(true);
    if (S.runId) return;  // ya corriendo: solo mostrar el avance
    $("btn-sync").classList.add("girando");
    pintar({ estado: "queued", etapa: 0, etapa_texto: "Iniciando", resultados: [] });
    try {
      const r = await fetch(FN, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: "{}" });
      const d = await r.json().catch(() => ({}));
      if (!d.id) throw new Error(d.error || `HTTP ${r.status}`);
      S.runId = d.id;
      vigilar();
    } catch (e) {
      $("btn-sync").classList.remove("girando");
      pintar({ estado: "failed", mensaje: "No se pudo iniciar la sincronización: " + e.message, resultados: [] });
    }
  }

  async function vigilar() {
    clearTimeout(S.timer);
    if (!S.runId) return;
    try {
      const rows = await leer(`sync_runs?id=eq.${S.runId}&select=*`);
      let run = rows[0];
      if (run && (run.estado === "queued" || run.estado === "running") &&
          Date.now() - Date.parse(run.updated_at) > STALE_MS) {
        run = { ...run, estado: "failed", mensaje: "Se interrumpió sin terminar. Toca ↻ para intentar de nuevo." };
      }
      if (run) {
        pintar(run);
        if (run.estado === "done" || run.estado === "failed") return terminar();
      }
    } catch (e) {
      // Sin red un momento: se vuelve a intentar.
    }
    S.timer = setTimeout(vigilar, POLL_MS);
  }

  async function terminar() {
    S.runId = null;
    $("btn-sync").classList.remove("girando");
    await cargarRondas();
    aplicarFecha();  // si el formulario de nueva partida está abierto, ya llena Mi score
  }

  async function retomar() {
    // Si cerraste la app a media sincronización, se retoma al abrirla.
    try {
      const rows = await leer("sync_runs?estado=in.(queued,running)&select=id,updated_at&order=created_at.desc&limit=1");
      if (rows[0] && Date.now() - Date.parse(rows[0].updated_at) < STALE_MS) {
        S.runId = rows[0].id;
        $("btn-sync").classList.add("girando");
        panel(true);
        vigilar();
      }
    } catch (e) {
      console.warn("[golf-sync] no se pudo revisar la sincronización en curso", e);
    }
  }

  // ---------------------------------------------------------------- arranque
  function init() {
    $("btn-sync").addEventListener("click", iniciarSync);
    $("sync-cerrar").addEventListener("click", () => panel(false));
    document.querySelectorAll(".tipo-btn").forEach((b) =>
      b.addEventListener("click", () => {
        ponerTipo(b.dataset.tipo);
        if (b.dataset.tipo === "individual") aplicarFecha();
      }));
    $("partida-fecha").addEventListener("change", aplicarFecha);
    $("partida-jugador").addEventListener("change", (e) => {
      const fj = jugadorFoursome();
      if (!S.editando && fj && e.target.value === fj.id && S.tipo !== "foursome") ponerTipo("foursome");
    });
    cargarRondas().then(aplicarFecha);
    retomar();
  }

  window.golfSync = { alAbrirFormulario, datosFoursome, _estado: S };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

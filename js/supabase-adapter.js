// Shankmaster compatibility adapter.
// Translates the app's original Genspark-style  fetch('tables/<t>...')  calls
// into Supabase PostgREST calls, with ZERO changes to app.js.
// Loaded BEFORE app.js.
(function () {
  const cfg = window.SHANKMASTER_SUPABASE;
  if (!cfg || !cfg.url || cfg.url.indexOf("REPLACE_WITH") === 0) {
    console.error("[Shankmaster] Supabase not configured yet. Edit js/supabase-config.js");
    return;
  }
  const REST = cfg.url.replace(/\/+$/, "") + "/rest/v1/";
  const origFetch = window.fetch.bind(window);

  function isTablesCall(u) {
    return typeof u === "string" && /^(\.?\/)?tables\//.test(u);
  }

  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url);
    if (isTablesCall(url)) {
      return handleTables(url.replace(/^\.?\//, ""), init || {});
    }
    return origFetch(input, init);
  };

  async function handleTables(path, init) {
    const method = (init.method || "GET").toUpperCase();
    const [rawPath, rawQuery] = path.split("?");
    const parts = rawPath.split("/");          // ["tables","<table>",("<id>")]
    const table = parts[1];
    const id = parts[2];

    const inParams = new URLSearchParams(rawQuery || "");
    const outParams = new URLSearchParams();

    if (inParams.has("limit")) outParams.set("limit", inParams.get("limit"));
    if (inParams.has("sort")) {
      const s = inParams.get("sort");
      outParams.set("order", s.charAt(0) === "-" ? s.slice(1) + ".desc" : s + ".asc");
    }
    if (id) outParams.set("id", "eq." + id);   // PostgREST addresses rows by filter

    let target = REST + table;
    const qs = outParams.toString();
    if (qs) target += "?" + qs;

    const headers = Object.assign({}, init.headers || {}, {
      apikey: cfg.anonKey,
      Authorization: "Bearer " + cfg.anonKey
    });

    let m = method;
    if (m === "PUT") m = "PATCH";              // PostgREST uses PATCH for updates
    if (m === "GET") headers["Prefer"] = "count=exact";
    else headers["Content-Type"] = headers["Content-Type"] || "application/json";

    const resp = await origFetch(target, { method: m, headers, body: init.body });

    if (m !== "GET") return resp;              // app only checks resp.ok on writes

    // Reshape PostgREST array -> the {data, total, table} shape app.js expects
    const arr = await resp.json();
    let total = Array.isArray(arr) ? arr.length : 0;
    const range = resp.headers.get("content-range");
    if (range && range.indexOf("/") !== -1) {
      const t = parseInt(range.split("/")[1], 10);
      if (!isNaN(t)) total = t;
    }
    return new Response(JSON.stringify({ data: arr, total: total, table: table }), {
      status: resp.ok ? 200 : resp.status,
      headers: { "Content-Type": "application/json" }
    });
  }
})();

// golf-sync: the Shankmaster sync icon calls this. It opens a sync_runs row
// (only one may be active; a second tap gets the running one back) and starts
// the private GitHub Actions job that posts to GHIN and fills rondas.
//
// Secrets: GH_DISPATCH_TOKEN (fine-grained GitHub token, Actions write on
// mister2ce/golf-sync only). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// provided by Supabase. No login by design (his app, his rule): the worst a
// stray call can do is start the same sync he would.

const GH_REPO = "mister2ce/golf-sync";
const STALE_MS = 15 * 60 * 1000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "solo POST" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const gh = Deno.env.get("GH_DISPATCH_TOKEN");
  if (!gh) return json({ error: "Falta GH_DISPATCH_TOKEN en Supabase." }, 500);

  const rest = (path: string, init: RequestInit = {}) =>
    fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  const now = () => new Date().toISOString();

  // A run with no progress for 15 minutes is dead: free the lock.
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  await rest(`sync_runs?estado=in.(queued,running)&updated_at=lt.${cutoff}`, {
    method: "PATCH",
    body: JSON.stringify({ estado: "failed", mensaje: "Se interrumpió sin terminar.", finished_at: now() }),
  });

  const ins = await rest("sync_runs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ origen: "app", estado: "queued", etapa: 0, etapa_texto: "Iniciando" }),
  });
  if (ins.status === 409) {
    // Already running (another tap, or /golf-score on the Mac): follow that one.
    const act = await rest("sync_runs?estado=in.(queued,running)&select=id&limit=1");
    const rows = await act.json();
    return json({ id: rows[0]?.id ?? null, ya_corriendo: true });
  }
  if (!ins.ok) return json({ error: `No se pudo crear la sincronización: ${await ins.text()}` }, 500);
  const run = (await ins.json())[0];

  const d = await fetch(
    `https://api.github.com/repos/${GH_REPO}/actions/workflows/sync.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${gh}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "shankmaster-golf-sync",
      },
      body: JSON.stringify({ ref: "main", inputs: { run_id: run.id } }),
    },
  );
  if (!d.ok) {
    const why = `No se pudo iniciar la sincronización en GitHub (${d.status}).`;
    await rest(`sync_runs?id=eq.${run.id}`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "failed", mensaje: why, finished_at: now() }),
    });
    return json({ id: run.id, error: why }, 502);
  }
  return json({ id: run.id });
});

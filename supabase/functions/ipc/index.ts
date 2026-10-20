// Trae la variación mensual del IPC (INDEC) desde la API de series de datos.gob.ar y carga los meses
// que falten en la tabla "ipc". Con cada mes nuevo, los precios de la tabla "aranceles" se ajustan solos.
// POST /functions/v1/ipc
//   · desde pg_cron: header x-ipc-clave = secreto IPC_CLAVE (ver 02_pacientes_y_precios.sql)
//   · desde el panel: con la sesión de un administrador
// Respuesta: { cargados: [{ periodo, variacion }], ultimo }
import { createClient } from 'jsr:@supabase/supabase-js@2';

const URL_SB = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_SB, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-ipc-clave',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function autorizado(req: Request): Promise<boolean> {
  const clave = Deno.env.get('IPC_CLAVE');
  if (clave && req.headers.get('x-ipc-clave') === clave) return true;
  const auth = req.headers.get('Authorization');
  if (!auth) return false;
  const usuario = createClient(URL_SB, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data } = await usuario.rpc('soy_admin');
  return data === true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (!(await autorizado(req))) return json({ error: 'No autorizado' }, 401);

  const { data: aj } = await admin.from('ajustes').select('valor').eq('clave', 'ipc_serie').maybeSingle();
  const serie = aj?.valor || '148.3_INIVELNAL_DICI_M_26';
  const url = `https://apis.datos.gob.ar/series/api/series/?ids=${encodeURIComponent(serie)}` +
    '&representation_mode=percent_change&sort=desc&limit=24&format=json';
  const r = await fetch(url);
  if (!r.ok) return json({ error: `datos.gob.ar respondió ${r.status}` }, 502);
  const cuerpo = await r.json();
  // data: [["2026-09-01", 0.021], …]  (variación como fracción)
  const filas: [string, number | null][] = cuerpo?.data ?? [];

  const { data: ya } = await admin.from('ipc').select('periodo');
  const cargados = new Set((ya ?? []).map((x: { periodo: string }) => x.periodo));
  const nuevos = filas
    .filter(([periodo, v]) => v !== null && !cargados.has(periodo))
    .map(([periodo, v]) => ({ periodo, variacion: Math.round((v as number) * 100000) / 1000 }));

  for (const n of nuevos) {
    const { error } = await admin.rpc('cargar_ipc', { p_periodo: n.periodo, p_variacion: n.variacion, p_fuente: `INDEC · ${serie}` });
    if (error) return json({ error: error.message, cargados: [] }, 500);
  }
  return json({ cargados: nuevos, ultimo: filas[0]?.[0] ?? null });
});

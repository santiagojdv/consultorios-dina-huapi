// Asistente de WhatsApp del consultorio (WhatsApp Cloud API oficial de Meta + Claude).
//
// GET  /functions/v1/whatsapp   → verificación del webhook (Meta, una sola vez al configurarlo)
// POST /functions/v1/whatsapp   → mensajes que llegan al número del consultorio (Meta, firmado), y con el
//                                número en coexistencia, los que Nati manda desde la app (smb_message_echoes)
// POST /functions/v1/whatsapp   con {accion: 'enviar', telefono, texto} y la sesión de un profesional
//                                → respuesta escrita por una persona desde la bandeja del panel
//
// Secretos (Edge Functions → Secrets):
//   ANTHROPIC_API_KEY  clave de la API de Claude
//   WA_TOKEN           token permanente de un usuario del sistema de Meta Business
//   WA_PHONE_ID        "Phone number ID" del número del consultorio
//   WA_APP_SECRET      "App secret" de la app de Meta (para validar que el aviso viene de Meta)
//   WA_VERIFY_TOKEN    texto cualquiera; el mismo que se pone al configurar el webhook en Meta
//   WA_AVISO_NUMERO    (opcional) celular de Nati para avisarle de cada derivación, ej. 5492944636977.
//                      Con el número en coexistencia (app WhatsApp Business + asistente) Nati ya ve el chat
//                      en la app; este aviso solo sirve si va a otro número, nunca al del consultorio.
//   WA_AVISO_PLANTILLA (opcional) nombre de la plantilla aprobada para ese aviso (por defecto aviso_derivacion)
//   CLAUDE_MODELO      (opcional) por defecto claude-opus-5-5
//   CLAUDE_ESFUERZO    (opcional) low | medium | high; por defecto low (charla corta)
import { createClient } from 'jsr:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import { HERRAMIENTAS, instrucciones, contextoDelMomento, ejecutarHerramienta, aTurnos, type Mensaje } from './asistente.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const env = (k: string, def = '') => Deno.env.get(k) ?? def;
const URL_SB = env('SUPABASE_URL');
const admin = createClient(URL_SB, env('SUPABASE_SERVICE_ROLE_KEY'));
const claude = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') });
const MODELO = env('CLAUDE_MODELO', 'claude-opus-5-5');
const ESFUERZO = env('CLAUDE_ESFUERZO', 'low');
const GRAPH = `https://graph.facebook.com/${env('WA_GRAPH_VERSION', 'v23.0')}/${env('WA_PHONE_ID')}/messages`;
const ESPERA_MS = 3000; // la gente manda varios mensajes seguidos: se contesta todo junto
const SOLO_TEXTO = 'Por ahora solo puedo leer mensajes de texto. ¿Me lo escribís? Si preferís hablar con Nati, decime y le paso tu consulta.';
const FALLA = 'Perdón, tuve un problema para responderte. Ya le pasé tu mensaje a Nati para que te conteste por acá.';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  if (req.method === 'GET') {
    const q = new URL(req.url).searchParams;
    if (q.get('hub.mode') === 'subscribe' && q.get('hub.verify_token') === env('WA_VERIFY_TOKEN') && env('WA_VERIFY_TOKEN')) {
      return new Response(q.get('hub.challenge') ?? '', { status: 200 });
    }
    return new Response('No autorizado', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 });

  const crudo = await req.text();
  if (req.headers.get('x-hub-signature-256')) {
    if (!(await firmaValida(crudo, req.headers.get('x-hub-signature-256')!))) return new Response('Firma inválida', { status: 401 });
    // Meta reintenta si no contestamos rápido: respondemos ya y procesamos en segundo plano.
    EdgeRuntime.waitUntil(procesarAviso(JSON.parse(crudo)).catch((e) => console.error('aviso', e)));
    return new Response('ok', { status: 200 });
  }
  return panel(req, crudo);
});

async function firmaValida(cuerpo: string, firma: string): Promise<boolean> {
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(env('WA_APP_SECRET')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(cuerpo)));
  const esperado = 'sha256=' + [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (esperado.length !== firma.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ firma.charCodeAt(i);
  return dif === 0;
}

// ───────────────────────── Mensajes de pacientes ─────────────────────────

async function procesarAviso(aviso: any) {
  for (const entrada of aviso?.entry ?? []) {
    for (const cambio of entrada.changes ?? []) {
      const v = cambio.value ?? {};
      for (const m of v.messages ?? []) {
        const nombre = v.contacts?.find((c: any) => c.wa_id === m.from)?.profile?.name ?? '';
        await recibir(m, nombre);
      }
      // Número en coexistencia: lo que Nati escribe desde la app del celular llega como "eco".
      for (const e of v.message_echoes ?? []) {
        const { error } = await admin.rpc('wa_registrar_eco', {
          p_telefono: String(e.to), p_texto: textoDe(e) ?? `[${e.type}]`, p_wa_id: e.id,
        });
        if (error) throw error;
      }
    }
  }
}

function textoDe(m: any): string | null {
  if (m.type === 'text') return m.text?.body ?? '';
  if (m.type === 'button') return m.button?.text ?? '';
  if (m.type === 'interactive') return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '';
  return null; // audio, foto, ubicación, etc.
}

async function recibir(m: any, nombre: string) {
  const tel = String(m.from);
  const texto = textoDe(m);
  const { data: r, error } = await admin.rpc('wa_registrar_entrante', {
    p_telefono: tel, p_nombre: nombre, p_texto: texto ?? `[${m.type === 'audio' ? 'audio' : m.type}]`, p_wa_id: m.id,
  });
  if (error) throw error;
  if (r.duplicado || r.estado !== 'bot' || !r.bot_activo) return; // derivada o asistente apagado: queda en la bandeja

  if (texto === null) return enviarYGuardar(tel, SOLO_TEXTO, 'asistente');

  await new Promise((ok) => setTimeout(ok, ESPERA_MS));
  const { data: ultimo } = await admin.from('wa_mensajes').select('id').eq('telefono', tel).eq('direccion', 'entrante')
    .order('id', { ascending: false }).limit(1).maybeSingle();
  if (ultimo && ultimo.id !== r.id) return; // llegó otro mensaje: lo contesta ese, con todo junto

  try {
    await responder(tel, nombre);
  } catch (e) {
    console.error('asistente', e);
    await derivar(tel, 'Falla del asistente', String((e as Error)?.message ?? e).slice(0, 300));
    await enviarYGuardar(tel, FALLA, 'asistente');
  }
}

async function responder(tel: string, nombre: string) {
  const [{ data: hist }, { data: aj }] = await Promise.all([
    admin.from('wa_mensajes').select('autor, texto').eq('telefono', tel)
      .gte('creado', new Date(Date.now() - 48 * 3600e3).toISOString()).order('id', { ascending: false }).limit(40),
    admin.from('ajustes').select('valor').eq('clave', 'bot_info').maybeSingle(),
  ]);
  const messages: Anthropic.Beta.BetaMessageParam[] = aTurnos(((hist ?? []) as Mensaje[]).reverse(), contextoDelMomento(new Date(), nombre));
  if (!messages.length) return;

  const ctx = { sb: admin, telefono: tel, derivar: (motivo: string, resumen: string) => derivar(tel, motivo, resumen) };
  let respuesta: Anthropic.Beta.BetaMessage | null = null;
  for (let vuelta = 0; vuelta < 8; vuelta++) {
    respuesta = await claude.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      system: [{ type: 'text', text: instrucciones(aj?.valor ?? ''), cache_control: { type: 'ephemeral' } }],
      tools: HERRAMIENTAS as Anthropic.Beta.BetaTool[],
      messages,
      output_config: { effort: ESFUERZO as 'low' | 'medium' | 'high' },
      // Si un filtro de seguridad rechaza el pedido, la API lo reintenta sola con otro modelo.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    if (respuesta.stop_reason === 'refusal') {
      await derivar(tel, 'El asistente no pudo responder', 'La consulta necesita a una persona.');
      return enviarYGuardar(tel, 'Esa consulta prefiero pasársela a Nati, que te va a responder por acá en cuanto pueda.', 'asistente');
    }
    messages.push({ role: 'assistant', content: respuesta.content });
    if (respuesta.stop_reason === 'pause_turn') continue;
    if (respuesta.stop_reason !== 'tool_use') break;
    const usos = respuesta.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    const resultados = await Promise.all(usos.map(async (u) => {
      try {
        return { type: 'tool_result' as const, tool_use_id: u.id, content: await ejecutarHerramienta(u.name, u.input as Record<string, unknown>, ctx) };
      } catch (e) {
        return { type: 'tool_result' as const, tool_use_id: u.id, content: `Error: ${(e as Error).message}`, is_error: true };
      }
    }));
    messages.push({ role: 'user', content: resultados });
  }

  const texto = (respuesta?.content ?? []).filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n\n').trim();
  if (texto) await enviarYGuardar(tel, texto, 'asistente');
}

async function derivar(tel: string, motivo: string, resumen: string) {
  await admin.from('wa_conversaciones').update({ estado: 'humano', motivo_derivacion: motivo }).eq('telefono', tel);
  await admin.from('wa_mensajes').insert({ telefono: tel, direccion: 'saliente', autor: 'sistema', texto: `Derivada a Nati: ${motivo}\n${resumen}`.slice(0, 4096) });
  const aviso = env('WA_AVISO_NUMERO');
  if (aviso) {
    const { data: c } = await admin.from('wa_conversaciones').select('nombre').eq('telefono', tel).maybeSingle();
    // Fuera de las 24 h WhatsApp solo deja mandar plantillas aprobadas: el aviso a Nati usa una.
    await graph({
      messaging_product: 'whatsapp', to: aviso, type: 'template',
      template: {
        name: env('WA_AVISO_PLANTILLA', 'aviso_derivacion'), language: { code: 'es_AR' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: c?.nombre || `+${tel}` }, { type: 'text', text: motivo || 'pidió hablar con una persona' }] }],
      },
    }).catch((e) => console.error('aviso a Nati', e));
  }
}

// ───────────────────────── Envío ─────────────────────────

async function graph(cuerpo: unknown) {
  const r = await fetch(GRAPH, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('WA_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`WhatsApp respondió ${r.status}: ${datos?.error?.message ?? ''}`);
  return datos;
}

async function enviarYGuardar(tel: string, texto: string, autor: 'asistente' | 'persona', autorId: string | null = null) {
  const r = await graph({ messaging_product: 'whatsapp', to: tel, type: 'text', text: { body: texto.slice(0, 4096) } });
  await admin.from('wa_mensajes').insert({ telefono: tel, direccion: 'saliente', autor, autor_id: autorId, texto: texto.slice(0, 4096), wa_id: r?.messages?.[0]?.id ?? null });
  await admin.from('wa_conversaciones').update({ ultimo_mensaje: new Date().toISOString() }).eq('telefono', tel);
}

// ───────────────────────── Bandeja del panel ─────────────────────────

async function panel(req: Request, crudo: string) {
  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'No autorizado' }, 401);
  const usuario = createClient(URL_SB, env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } } });
  const [{ data: puede }, { data: u }] = await Promise.all([usuario.rpc('soy_whatsapp'), usuario.auth.getUser()]);
  if (puede !== true || !u?.user) return json({ error: 'No tenés acceso a la bandeja de WhatsApp' }, 403);

  let cuerpo: { accion?: string; telefono?: string; texto?: string };
  try { cuerpo = JSON.parse(crudo); } catch { return json({ error: 'Pedido inválido' }, 400); }
  if (cuerpo.accion !== 'enviar') return json({ error: 'Acción desconocida' }, 400);
  const texto = String(cuerpo.texto ?? '').trim();
  if (!texto) return json({ error: 'Escribí un mensaje' }, 400);

  const { data: c } = await admin.from('wa_conversaciones').select('telefono, ultimo_entrante').eq('telefono', String(cuerpo.telefono ?? '')).maybeSingle();
  if (!c) return json({ error: 'No existe esa conversación' }, 404);
  if (!c.ultimo_entrante || Date.parse(c.ultimo_entrante) < Date.now() - 24 * 3600e3) {
    return json({ error: 'Pasaron más de 24 horas desde el último mensaje del paciente. WhatsApp no deja escribirle hasta que vuelva a escribir (o con una plantilla aprobada).' }, 409);
  }
  try {
    await enviarYGuardar(c.telefono, texto, 'persona', u.user.id);
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
  // Si escribe una persona, la conversación queda en sus manos hasta que la devuelva al asistente.
  await admin.from('wa_conversaciones').update({ estado: 'humano', atendida_por: u.user.id, no_leidos: 0 }).eq('telefono', c.telefono);
  return json({ ok: true });
}

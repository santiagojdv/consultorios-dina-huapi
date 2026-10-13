// Entrega el calendario .ics de un profesional para suscribirse desde Google Calendar o iPhone.
// GET /functions/v1/calendario?t=<token>  →  text/calendar
// El token es el secreto: se genera desde "Mi perfil" y se puede regenerar. No requiere login.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('t') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return new Response('Link inválido', { status: 400 });
  }
  const { data, error } = await sb.rpc('calendario_ics', { p_token: token });
  if (error) return new Response('Error al generar el calendario', { status: 500 });
  if (!data) return new Response('Calendario no encontrado', { status: 404 });
  return new Response(data, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="turnos.ics"',
      'Cache-Control': 'no-store',
    },
  });
});

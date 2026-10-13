import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const TZ = 'America/Argentina/Buenos_Aires';
export const configurado = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const sb = configurado ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
/** Servicio que entrega el calendario .ics de cada profesional (supabase/functions/calendario). */
export const URL_FEED = configurado ? `${SUPABASE_URL}/functions/v1/calendario` : '';

export const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// ── Fechas: todo se muestra en hora del consultorio, sin importar la zona del dispositivo ──

const fmt = (opts) => new Intl.DateTimeFormat('es-AR', { timeZone: TZ, ...opts });
const fHora = fmt({ hour: '2-digit', minute: '2-digit', hour12: false });
const fDiaCorto = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const fDiaLargo = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const fISO = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });

export const hora = (d) => fHora.format(new Date(d));
export const diaCorto = (d) => fDiaCorto.format(new Date(d));
export const diaLargo = (d) => fDiaLargo.format(new Date(d));
/** Fecha local del consultorio como 'YYYY-MM-DD'. */
export const fechaLocal = (d) => {
  const p = Object.fromEntries(fISO.formatToParts(new Date(d)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};
/** Suma días a una fecha 'YYYY-MM-DD'. */
export const sumarDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Lunes de la semana de una fecha 'YYYY-MM-DD'. */
export const lunesDe = (iso) => {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay() || 7;
  return sumarDias(iso, 1 - dow);
};
/** Fecha y hora local del consultorio → instante ISO. Argentina no tiene horario de verano (UTC−3). */
export const instante = (fecha, hhmm) => new Date(`${fecha}T${hhmm}:00-03:00`).toISOString();
export const diaDeFecha = (iso) => fDiaCorto.format(new Date(`${iso}T15:00:00Z`));

// ── DOM ──

export const $ = (sel, root = document) => root.querySelector(sel);
export function h(tag, attrs = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of hijos.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

export function aviso(el, texto, tipo = 'error') {
  el.replaceChildren();
  if (!texto) return;
  el.append(h('div', { class: `aviso ${tipo}`, role: tipo === 'error' ? 'alert' : 'status' }, texto));
}

/** Mensaje legible a partir de un error de Supabase/Postgres. */
export function mensajeError(e) {
  const m = e?.message || String(e);
  if (/turno_superpuesto/.test(m)) return 'Ese horario se superpone con otro turno.';
  if (/alquiler_superpuesto_consultorio/.test(m)) return 'Ese consultorio ya está alquilado en esa franja.';
  if (/alquiler_superpuesto_profesional/.test(m)) return 'Ese profesional ya tiene otro alquiler en esa franja.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión. Probá de nuevo en un momento.';
  return m;
}

export const soloDigitos = (t) => (t || '').replace(/\D/g, '');
export const linkWhatsApp = (tel, texto = '') => {
  let n = soloDigitos(tel);
  if (n.length === 10) n = `549${n}`; // número local argentino
  return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
};

export function linkGoogleCalendar({ titulo, inicio, fin, lugar = '', detalle = '' }) {
  const z = (d) => new Date(d).toISOString().replace(/[-:]|\.\d{3}/g, '');
  const q = new URLSearchParams({ action: 'TEMPLATE', text: titulo, dates: `${z(inicio)}/${z(fin)}`, location: lugar, details: detalle });
  return `https://calendar.google.com/calendar/render?${q}`;
}

export function faltaConfig(el) {
  el.replaceChildren(h('div', { class: 'aviso error' },
    'El sistema de turnos todavía no está configurado. Completá turnos/config.js (ver README).'));
}

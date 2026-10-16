// Sección Equipo de la portada: la arma con los profesionales que aceptan turnos online
// (los mismos de turnos/). Cada ficha lleva a su agenda y, si cargó uno, a su sitio.
// Si el sistema de turnos no está configurado o falla, queda la ficha fija del HTML.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../turnos/config.js';

const team = document.querySelector('#equipo .team');
const SITIO_OK = /^(https:\/\/\S+|[a-z0-9_-]+\/)$/;
const FOTO_OK = /^(https:\/\/\S+|img\/[\w./-]+)$/;
const FLECHA = '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5"/></svg>';

function el(tag, attrs = {}, ...hijos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  for (const c of hijos) if (c != null) n.append(c);
  return n;
}

const iniciales = (nombre) => nombre.replace(/^(dra?\.?|od\.?|lic\.?)\s+/i, '')
  .split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

function ficha(p) {
  const foto = el('div', { class: 'ph-photo' });
  if (p.foto && FOTO_OK.test(p.foto)) foto.append(el('img', { src: p.foto, alt: p.nombre, loading: 'lazy' }));
  else foto.append(el('span', { class: 'initials', 'aria-hidden': 'true' }, iniciales(p.nombre)));

  const turno = el('a', { class: 'btn sm', href: `turnos/index.html?p=${encodeURIComponent(p.id)}` }, 'Sacar turno');
  const acciones = el('div', { class: 'actions' }, turno);
  if (p.web && SITIO_OK.test(p.web)) {
    const externo = p.web.startsWith('https://');
    const a = el('a', { class: 'link-arrow', href: p.web, target: externo ? '_blank' : null, rel: externo ? 'noopener' : null }, 'Conocer su trabajo ');
    a.insertAdjacentHTML('beforeend', FLECHA);
    acciones.append(a);
  }
  return el('article', { class: 'member' }, foto,
    el('div', { class: 'body' },
      p.especialidad ? el('span', { class: 'role' }, p.especialidad) : null,
      el('h3', {}, p.nombre),
      p.bio ? el('p', {}, p.bio) : null,
      acciones));
}

async function cargar() {
  const { sb } = await import('../turnos/comun.js'); // trae la librería de Supabase solo si hace falta
  const { data, error } = await sb.rpc('profesionales_publicos');
  if (error || !data?.length) return; // queda la versión fija
  const sumate = team.querySelector('.member.join');
  if (sumate) {
    sumate.querySelector('.role').textContent = 'Para profesionales';
    sumate.querySelector('h3').textContent = 'Sumate al equipo';
  }
  team.classList.add('many');
  team.replaceChildren(...data.map(ficha), ...(sumate ? [sumate] : []));
}

if (team && SUPABASE_URL && SUPABASE_ANON_KEY) cargar().catch(() => {});

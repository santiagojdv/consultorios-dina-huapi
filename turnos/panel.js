import {
  sb, demo, configurado, faltaConfig, $, h, aviso, mensajeError, DIAS,
  hora, diaLargo, diaDeFecha, fechaLocal, sumarDias, lunesDe, instante, linkWhatsApp, URL_FEED,
} from './comun.js';
import { leerCsv, leerExcel, interpretar, aCsv, numero } from './planilla.js';

const st = { yo: null, semana: null, consultorios: [], profesionales: [], alquileres: [], cal: { desde: null, dias: null, box: null, datos: [] } };
const hoy = () => fechaLocal(new Date());
const ddmm = (iso) => iso.split('-').reverse().slice(0, 2).join('/');
const ddmmaa = (iso) => iso.split('-').reverse().join('/');
const hhmm = (t) => t.slice(0, 5);
const pesos = (n) => (n == null ? '—' : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n));
const MODALIDAD = { particular: 'Particular', cubierto: 'Cubierto', copago: 'Adicional', no_cubre: 'No cubre' };
const mesTexto = (iso) => new Intl.DateTimeFormat('es-AR', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 7)}-15T12:00:00Z`));
const finDeMes = (iso, masMeses = 0) => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m + masMeses, 0)).toISOString().slice(0, 10);
};

// ───────────────────────── Sesión ─────────────────────────

if (!configurado) {
  faltaConfig($('#estado'));
} else {
  sb.auth.onAuthStateChange((evento, sesion) => {
    if (evento === 'INITIAL_SESSION' || evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') {
      setTimeout(() => entrar(sesion), 0); // fuera del callback, como recomienda Supabase
    }
  });
}

async function entrar(sesion) {
  if (!sesion) {
    st.yo = null;
    $('#app').hidden = true; $('#sesion').hidden = true; $('#login').hidden = false;
    return;
  }
  if (st.yo?.id === sesion.user.id) return;
  const { data: yo, error } = await sb.from('profesionales').select('*').eq('id', sesion.user.id).maybeSingle();
  if (error) return aviso($('#estado'), mensajeError(error));
  if (!yo || !yo.activo) {
    aviso($('#estado'), 'Tu usuario no está habilitado. Consultá con la administración del consultorio.');
    await sb.auth.signOut();
    return;
  }
  st.yo = yo;
  history.replaceState(null, '', location.pathname); // limpia el token del link mágico
  aviso($('#estado'), '');
  $('#login').hidden = true; $('#app').hidden = false; $('#sesion').hidden = false;
  $('#quien').textContent = yo.nombre || yo.email;
  cargarMisServicios();
  // Un admin ve la vista de administración; si además atiende (tiene alquileres), puede alternar.
  st.atiende = !yo.es_admin;
  if (yo.es_admin) {
    const { count } = await sb.from('alquileres').select('id', { count: 'exact', head: true }).eq('profesional_id', yo.id);
    st.atiende = Boolean(count) || yo.publico;
  }
  let preferida = null;
  try { preferida = localStorage.getItem(`vista-${yo.id}`); } catch { /* sin almacenamiento */ }
  aplicarVista(yo.es_admin && !(st.atiende && preferida === 'pro') ? 'admin' : 'pro');
}

/** Muestra las pestañas de una vista ("pro" o "admin") y abre la primera. */
function aplicarVista(vista) {
  st.vista = vista;
  try { localStorage.setItem(`vista-${st.yo.id}`, vista); } catch { /* sin almacenamiento */ }
  const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
  tabs.forEach((t) => { t.hidden = !t.dataset.vistas.split(' ').includes(vista); });
  $('#modo-badge').hidden = vista !== 'admin';
  const cambiar = $('#cambiar-vista');
  cambiar.hidden = !(st.yo.es_admin && st.atiende);
  cambiar.textContent = vista === 'admin' ? 'Ver mi agenda' : 'Ir a administración';
  $('#cal-ayuda').textContent = vista === 'admin'
    ? 'Franjas de color: horarios alquilados por cada profesional. Los turnos se ven como ocupados: los datos de pacientes quedan solo para cada profesional. Tocá un día para verlo solo.'
    : 'Franjas de color: horarios alquilados. Tus turnos llevan el nombre del paciente; los de colegas se ven como ocupados. Tocá un día para verlo solo.';
  aviso($('#estado'), vista === 'pro' && !st.yo.nombre
    ? 'Primer ingreso: completá tus datos en "Mi perfil" para poder recibir turnos online.' : '', 'info');
  tabs.find((t) => !t.hidden).click();
}

$('#cambiar-vista').addEventListener('click', () => aplicarVista(st.vista === 'admin' ? 'pro' : 'admin'));

// En la demostración no se mandan mails: se entra directo con un usuario de ejemplo.
if (demo) {
  const entrarComo = (id, texto) => h('button', { class: 'btn ghost sm', type: 'button', onclick: () => sb.demo.entrarComo(id) }, texto);
  $('#login').append(h('div', { class: 'demo-login' },
    h('p', { class: 'small muted' }, 'En la demostración no se mandan mails. Entrá directo con un usuario de ejemplo:'),
    h('div', { class: 'row' }, entrarComo('demo-nati', 'Dra. Natalia Cárdenas (profesional)'), entrarComo('demo-admin', 'Administración'))));
}

$('#login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const email = $('#login-email').value.trim().toLowerCase();
  const msg = $('#login-estado');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return aviso(msg, 'Revisá el email.');
  const btn = $('#login-btn'); btn.disabled = true;
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname },
  });
  btn.disabled = false;
  if (error) {
    const m = /signups? not allowed|not found|otp_disabled/i.test(error.message)
      ? 'Ese email no está habilitado. Pedile a la administración que te invite.'
      : /rate limit|security purposes/i.test(error.message)
        ? 'Esperá un minuto antes de pedir otro link.'
        : mensajeError(error);
    return aviso(msg, m);
  }
  aviso(msg, `Listo. Revisá tu correo (${email}) y tocá el link desde este mismo dispositivo.`, 'ok');
});

$('#salir').addEventListener('click', () => sb.auth.signOut());

// ───────────────────────── Pestañas ─────────────────────────

document.querySelectorAll('.tabs [role="tab"]').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.tabs [role="tab"]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
  if (tab.dataset.tab === 'agenda') cargarSemana(st.semana || lunesDe(hoy()));
  if (tab.dataset.tab === 'calendario') cargarCalendario(st.cal.desde);
  if (tab.dataset.tab === 'perfil') cargarPerfil();
  if (['reservas', 'profesionales', 'consultorios'].includes(tab.dataset.tab)) cargarAdmin();
  if (tab.dataset.tab === 'precios') cargarPrecios();
}));

// ───────────────────────── Agenda ─────────────────────────

async function cargarSemana(lunes) {
  st.semana = lunes;
  const domingo = sumarDias(lunes, 6);
  $('#ag-titulo').textContent = `${diaDeFecha(lunes)} – ${diaDeFecha(domingo)}`;
  const est = $('#ag-estado');
  aviso(est, 'Cargando…', 'info');

  const [turnos, libres] = await Promise.all([
    sb.from('turnos').select('*, servicios(nombre), obras_sociales(nombre), pacientes(dni, fecha_nacimiento, nro_afiliado)')
      .gte('inicio', instante(lunes, '00:00')).lt('inicio', instante(sumarDias(lunes, 7), '00:00'))
      .order('inicio'),
    $('#ag-libres').checked
      ? sb.rpc('turnos_disponibles', { p_profesional: st.yo.id, p_desde: lunes, p_hasta: domingo })
      : Promise.resolve({ data: [] }),
  ]);
  if (st.semana !== lunes) return;
  const error = turnos.error || libres.error;
  if (error) return aviso(est, mensajeError(error));
  aviso(est, '');

  const items = [
    ...turnos.data.map((t) => ({ tipo: 'turno', inicio: t.inicio, t })),
    ...libres.data.map((s) => ({ tipo: 'libre', inicio: s.inicio, s })),
  ].sort((a, b) => a.inicio.localeCompare(b.inicio));

  const dias = $('#ag-dias');
  dias.replaceChildren();
  for (let i = 0; i < 7; i++) {
    const f = sumarDias(lunes, i);
    const delDia = items.filter((x) => fechaLocal(x.inicio) === f);
    dias.append(h('div', { class: `dia${delDia.length ? '' : ' sin-nada'}` },
      h('h3', {}, diaDeFecha(f), f === hoy() ? ' · hoy' : ''),
      delDia.length
        ? h('div', { class: 'stack', style: 'gap:.4rem' }, agrupar(delDia))
        : h('span', { class: 'vacio' }, '—')));
  }
  if (!items.length) aviso(est, 'Sin turnos ni horarios alquilados esta semana.', 'info');
}

function vistaTurno(t) {
  const cancelado = t.estado === 'cancelado';
  const texto = cancelado
    ? `Hola ${t.paciente_nombre}, te aviso que tuvimos que cancelar tu turno del ${diaLargo(t.inicio)} a las ${hora(t.inicio)}. Escribime para reprogramarlo.`
    : `Hola ${t.paciente_nombre}, te recuerdo tu turno del ${diaLargo(t.inicio)} a las ${hora(t.inicio)} en Consultorios Dina Huapi.`;
  return h('div', { class: `turno${cancelado ? ' cancelado' : ''}` },
    h('span', { class: 'hh' }, `${hora(t.inicio)}–${hora(t.fin)} `, t.origen === 'online' ? h('span', { class: 'badge' }, 'online') : null),
    h('span', { class: 'nom' }, t.paciente_nombre),
    t.servicios ? h('span', { class: 'small' }, t.servicios.nombre) : null,
    t.detalle ? h('span', { class: 'muted small' }, `“${t.detalle}”`) : null,
    t.obras_sociales || t.modalidad ? h('span', { class: 'muted small' }, [
      t.obras_sociales?.nombre ?? 'Particular',
      t.pacientes?.nro_afiliado ? `n.º ${t.pacientes.nro_afiliado}` : null,
      t.modalidad === 'cubierto' ? 'cubierto' : t.modalidad === 'copago' ? `adicional ${pesos(t.monto_estimado)}` : t.monto_estimado != null ? `particular ${pesos(t.monto_estimado)}` : null,
    ].filter(Boolean).join(' · ')) : null,
    t.pacientes ? h('span', { class: 'muted small' }, `DNI ${t.pacientes.dni}${t.pacientes.fecha_nacimiento ? ` · ${edad(t.pacientes.fecha_nacimiento)} años` : ''}`) : null,
    t.datos_distintos ? h('span', { class: 'small', style: 'color:#8a5a00' }, 'Revisar: el teléfono no coincide con la ficha de ese DNI') : null,
    t.nota ? h('span', { class: 'muted small' }, t.nota) : null,
    h('span', { class: 'acciones' },
      h('a', { href: linkWhatsApp(t.paciente_telefono, texto), target: '_blank', rel: 'noopener' }, cancelado ? 'Avisar por WhatsApp' : 'WhatsApp'),
      cancelado ? null : h('a', { href: `tel:${t.paciente_telefono}` }, 'Llamar'),
      cancelado ? null : h('button', { class: 'btn link', type: 'button', onclick: () => cancelarTurno(t) }, 'Cancelar')));
}

function edad(nac) {
  const [y, m, d] = nac.split('-').map(Number);
  const [hy, hm, hd] = hoy().split('-').map(Number);
  return hy - y - (hm < m || (hm === m && hd < d) ? 1 : 0);
}

// Turnos uno debajo del otro; los horarios libres consecutivos, juntos como chips.
function agrupar(items) {
  const out = [];
  let libres = null;
  for (const x of items) {
    if (x.tipo === 'libre') {
      if (!libres) out.push(libres = h('div', { class: 'slots' }));
      libres.append(vistaLibre(x.s));
    } else {
      libres = null;
      out.push(vistaTurno(x.t));
    }
  }
  return out;
}

function vistaLibre(s) {
  return h('button', {
    class: 'slot libre', type: 'button', title: 'Agregar turno en este horario', 'aria-label': `Agregar turno a las ${hora(s.inicio)}`,
    onclick: () => abrirTurno(fechaLocal(s.inicio), hora(s.inicio)),
  }, `+ ${hora(s.inicio)}`);
}

async function cancelarTurno(t) {
  if (!confirm(`¿Cancelar el turno de ${t.paciente_nombre} (${diaLargo(t.inicio)} ${hora(t.inicio)})?\nDespués podés avisarle por WhatsApp desde la agenda.`)) return;
  const { error } = await sb.from('turnos').update({ estado: 'cancelado', cancelado_por: 'profesional' }).eq('id', t.id);
  if (error) return aviso($('#ag-estado'), mensajeError(error));
  cargarSemana(st.semana);
}

$('#ag-ant').addEventListener('click', () => cargarSemana(sumarDias(st.semana, -7)));
$('#ag-sig').addEventListener('click', () => cargarSemana(sumarDias(st.semana, 7)));
$('#ag-hoy').addEventListener('click', () => cargarSemana(lunesDe(hoy())));
$('#ag-libres').addEventListener('change', () => cargarSemana(st.semana));

// ── Turno manual ──

const dlg = $('#dlg-turno');
function abrirTurno(fecha = hoy(), hh = '') {
  $('#turno-form').reset();
  $('#t-fecha').value = fecha;
  $('#t-hora').value = hh;
  $('#t-dur').value = st.yo.duracion_turno;
  $('#t-serv').replaceChildren(h('option', { value: '' }, '—'), ...(st.misServicios ?? []).map((x) => h('option', { value: String(x.id) }, x.nombre)));
  aviso($('#turno-estado'), '');
  dlg.showModal();
  (hh ? $('#t-nombre') : $('#t-hora')).focus();
}
$('#nuevo-turno').addEventListener('click', () => abrirTurno());
$('#t-serv').addEventListener('change', () => {
  const x = (st.misServicios ?? []).find((y) => String(y.id) === $('#t-serv').value);
  $('#t-dur').value = x ? x.duracion : st.yo.duracion_turno;
});
$('#t-cerrar').addEventListener('click', () => dlg.close());

$('#turno-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const msg = $('#turno-estado');
  const fecha = $('#t-fecha').value, hh = $('#t-hora').value, dur = Number($('#t-dur').value);
  const nombre = $('#t-nombre').value.trim(), tel = $('#t-tel').value.trim();
  if (!fecha || !hh || !dur) return aviso(msg, 'Completá fecha, hora y duración.');
  if (nombre.length < 2) return aviso(msg, 'Completá el nombre del paciente.');
  if (tel.replace(/\D/g, '').length < 6) return aviso(msg, 'Completá el teléfono.');
  const inicio = instante(fecha, hh);
  const fin = new Date(new Date(inicio).getTime() + dur * 60000).toISOString();
  const { error } = await sb.from('turnos').insert({
    profesional_id: st.yo.id, inicio, fin,
    paciente_nombre: nombre, paciente_telefono: tel,
    paciente_email: $('#t-email').value.trim().toLowerCase(), nota: $('#t-nota').value.trim(),
    servicio_id: $('#t-serv').value ? Number($('#t-serv').value) : null,
  });
  if (error) return aviso(msg, mensajeError(error));
  dlg.close();
  cargarSemana(lunesDe(fecha));
});

// ───────────────────────── Calendario consolidado ─────────────────────────
// Vista tipo agenda: una columna por día. Los alquileres que se superponen en el tiempo (distintos
// consultorios) se reparten el ancho; los que no, usan la columna entera. Cada turno va dentro de su alquiler.

const PX_MIN = 1; // alto de un minuto en la grilla
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_CORTOS = ['', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const minDelDia = (iso) => { const [a, b] = hora(iso).split(':').map(Number); return a * 60 + b; };
const dowDe = (f) => new Date(`${f}T12:00:00Z`).getUTCDay() || 7;
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function vistaInicial() {
  try { const v = Number(localStorage.getItem('cal-vista')); if ([1, 3, 7].includes(v)) return v; } catch { /* sin almacenamiento */ }
  return window.matchMedia('(min-width: 760px)').matches ? 7 : 3;
}

function inicioPara(fecha, dias) { return dias === 7 ? lunesDe(fecha) : fecha; }

async function cargarCalendario(desde) {
  const c = st.cal;
  if (!c.dias) { c.dias = vistaInicial(); $('#cal-vista').value = String(c.dias); }
  if (c.box == null) c.box = 'todos';
  c.desde = inicioPara(desde || c.desde || hoy(), c.dias);
  const hasta = sumarDias(c.desde, c.dias - 1);
  const pedido = `${c.desde}|${c.dias}`;
  c.pedido = pedido;
  aviso($('#cal-estado'), 'Cargando…', 'info');
  const [oc, bx] = await Promise.all([
    sb.rpc('ocupacion', { p_desde: c.desde, p_hasta: hasta }),
    sb.from('consultorios').select('*').eq('activo', true).order('id'),
  ]);
  if (c.pedido !== pedido) return; // el usuario ya cambió de rango
  const error = oc.error || bx.error;
  if (error) return aviso($('#cal-estado'), mensajeError(error));
  aviso($('#cal-estado'), '');
  c.datos = oc.data;
  st.consultorios = bx.data;
  const sel = $('#cal-box');
  sel.replaceChildren(h('option', { value: 'todos' }, 'Todos los consultorios'), ...bx.data.map((b) => h('option', { value: b.id }, b.nombre)));
  if (c.box !== 'todos' && !bx.data.some((b) => String(b.id) === String(c.box))) c.box = 'todos';
  sel.value = String(c.box);
  dibujarCalendario();
}

/**
 * Reparte el ancho entre bloques que se superponen, como un calendario. Dentro de un grupo de bloques
 * simultáneos, cada consultorio tiene su columna y siempre en el mismo orden (Box 1 a la izquierda).
 * Un mismo consultorio nunca se superpone consigo mismo: la base lo impide.
 */
function repartir(bloques) {
  const orden = [...bloques].sort((a, b) => a.ini - b.ini || b.fin - a.fin);
  let grupo = [], finGrupo = -1;
  const cerrar = () => {
    const boxes = [...new Set(grupo.map((b) => b.x.consultorio_id))].sort((a, b) => a - b);
    for (const b of grupo) { b.col = boxes.indexOf(b.x.consultorio_id); b.total = boxes.length; }
    grupo = [];
  };
  for (const b of orden) {
    if (grupo.length && b.ini >= finGrupo) cerrar();
    grupo.push(b);
    finGrupo = Math.max(finGrupo, b.fin);
  }
  if (grupo.length) cerrar();
  return orden;
}

function tituloRango(desde, hasta) {
  const [y1, m1] = desde.split('-').map(Number), [y2, m2] = hasta.split('-').map(Number);
  if (y1 === y2 && m1 === m2) return `${cap(MESES[m1 - 1])} ${y1}`;
  if (y1 === y2) return `${cap(MESES[m1 - 1].slice(0, 3))} – ${MESES[m2 - 1].slice(0, 3)} ${y1}`;
  return `${cap(MESES[m1 - 1].slice(0, 3))} ${y1} – ${MESES[m2 - 1].slice(0, 3)} ${y2}`;
}

function dibujarCalendario() {
  const c = st.cal;
  const fechas = Array.from({ length: c.dias }, (_, i) => sumarDias(c.desde, i));
  $('#cal-titulo').textContent = tituloRango(fechas[0], fechas.at(-1));

  const boxes = st.consultorios.filter((b) => c.box === 'todos' || String(b.id) === String(c.box));
  const visibles = new Set(boxes.map((b) => b.id));
  const datos = c.datos.filter((x) => visibles.has(x.consultorio_id));
  const corto = (nombre) => (nombre || '').replace(/^box\s*/i, 'B');

  // Colores estables por profesional (orden alfabético, sobre todo lo cargado)
  const pros = [...new Map(c.datos.map((x) => [x.profesional_id, x.profesional])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const color = new Map(pros.map(([id], i) => [id, `var(--p${(i % 6) + 1})`]));
  $('#cal-leyenda').replaceChildren(...pros.map(([id, nombre]) => h('span', { style: `--c:${color.get(id)}` }, h('i'), id === st.yo.id ? `${nombre} (vos)` : nombre)));

  const grilla = $('#cal-grilla');
  if (!boxes.length) { grilla.replaceChildren(); return aviso($('#cal-estado'), 'Todavía no hay consultorios cargados.', 'info'); }

  // Rango horario: lo ocupado en el período, como mínimo 8 a 20
  let desde = 8 * 60, hasta = 20 * 60;
  for (const x of datos) { desde = Math.min(desde, minDelDia(x.inicio)); hasta = Math.max(hasta, minDelDia(x.fin) || 24 * 60); }
  desde = Math.floor(desde / 60) * 60; hasta = Math.ceil(hasta / 60) * 60;
  const y = (m) => `${(m - desde) * PX_MIN}px`;
  grilla.style.setProperty('--dias', c.dias);
  grilla.style.setProperty('--min-dia', c.dias === 7 ? '6.5rem' : '0px');
  grilla.style.setProperty('--alto', `${(hasta - desde) * PX_MIN}px`);
  grilla.style.setProperty('--hora', `${60 * PX_MIN}px`);

  const lugar = (b, margen = 2) => `left:calc(${(b.col / b.total) * 100}% + ${margen}px);width:calc(${100 / b.total}% - ${margen + 2}px)`;
  const cabeceras = fechas.map((f) => h('button', {
    type: 'button', class: `cal-cab${f === hoy() ? ' hoy' : ''}`, title: 'Ver este día',
    onclick: () => { c.dias = 1; $('#cal-vista').value = '1'; cargarCalendario(f); },
  }, h('small', {}, DIAS_CORTOS[dowDe(f)]), h('strong', {}, String(Number(f.slice(8))))));

  const horas = h('div', { class: 'cal-horas' });
  for (let m = desde + 60; m < hasta; m += 60) horas.append(h('span', { style: `top:${y(m)}` }, `${String(m / 60).padStart(2, '0')}:00`));

  const ahoraMin = minDelDia(new Date().toISOString());
  const columnas = fechas.map((f) => {
    const col = h('div', { class: `cal-col${f === hoy() ? ' hoy' : ''}` });
    const delDia = datos.filter((x) => fechaLocal(x.inicio) === f);
    const minutos = (x) => ({ ini: minDelDia(x.inicio), fin: minDelDia(x.fin) || 24 * 60 });
    const alquileres = delDia.filter((z) => z.tipo === 'alquiler').map((x) => ({ x, ...minutos(x) }));
    const turnos = delDia.filter((z) => z.tipo === 'turno').map((x) => ({ x, ...minutos(x) }));
    // Cada turno va dentro de su alquiler; si no tiene (ej. alquiler ya terminado), ocupa su propio lugar.
    for (const t of turnos) {
      t.padre = alquileres.find((a) => a.x.consultorio_id === t.x.consultorio_id && a.x.profesional_id === t.x.profesional_id && a.ini <= t.ini && a.fin >= t.fin);
    }
    repartir([...alquileres, ...turnos.filter((t) => !t.padre)]);

    for (const a of alquileres) {
      const x = a.x;
      col.append(h('div', {
        class: 'cal-alq', title: `${x.profesional} · ${x.consultorio} · ${hora(x.inicio)}–${hora(x.fin)}`,
        style: `top:${y(a.ini)};height:${(a.fin - a.ini) * PX_MIN - 1}px;--c:${color.get(x.profesional_id)};${lugar(a)}`,
      }, h('b', {}, x.profesional), h('span', {}, `${corto(x.consultorio)} · ${hora(x.inicio)}–${hora(x.fin)}`)));
    }
    for (const t of turnos) {
      const x = t.x;
      const alto = (t.fin - t.ini) * PX_MIN - 2;
      const pos = `top:${y(t.ini)};height:${alto}px;--c:${color.get(x.profesional_id)};${t.padre ? lugar(t.padre, 7) : lugar(t)}`;
      const rango = `${hora(x.inicio)}–${hora(x.fin)}`;
      col.append(x.propio
        ? h('div', { class: 'cal-tur propio', style: pos, title: `${x.paciente} · ${rango} · ${x.consultorio}` },
          h('b', {}, x.paciente), alto > 26 ? h('span', {}, rango) : null)
        : h('div', { class: 'cal-tur ajeno', style: pos, title: `Ocupado · ${x.profesional} · ${rango} · ${x.consultorio}` },
          h('b', {}, 'Ocupado'), alto > 26 ? h('span', {}, rango) : null));
    }
    if (f === hoy() && ahoraMin > desde && ahoraMin < hasta) col.append(h('div', { class: 'cal-ahora', style: `top:${y(ahoraMin)}`, title: 'Ahora' }));
    return col;
  });

  grilla.replaceChildren(h('div', { class: 'cal-esquina' }), ...cabeceras, horas, ...columnas);
  if (!datos.length) aviso($('#cal-estado'), 'Sin alquileres ni turnos en estas fechas.', 'info');

}

$('#cal-ant').addEventListener('click', () => cargarCalendario(sumarDias(st.cal.desde, -st.cal.dias)));
$('#cal-sig').addEventListener('click', () => cargarCalendario(sumarDias(st.cal.desde, st.cal.dias)));
$('#cal-hoy').addEventListener('click', () => cargarCalendario(hoy()));
$('#cal-vista').addEventListener('change', (e) => {
  const centro = st.cal.dias === 7 && hoy() >= st.cal.desde && hoy() <= sumarDias(st.cal.desde, 6) ? hoy() : st.cal.desde;
  st.cal.dias = Number(e.target.value);
  try { localStorage.setItem('cal-vista', e.target.value); } catch { /* sin almacenamiento */ }
  cargarCalendario(centro);
});
$('#cal-box').addEventListener('change', (e) => { st.cal.box = e.target.value; dibujarCalendario(); });

// ───────────────────────── Perfil ─────────────────────────

const CAMPOS = { nombre: 'pf-nombre', especialidad: 'pf-esp', bio: 'pf-bio', web: 'pf-web', foto: 'pf-foto',
  telefono: 'pf-tel', duracion_turno: 'pf-dur',
  anticipacion_horas: 'pf-ant', ventana_dias: 'pf-ven', aviso_cancelacion_horas: 'pf-canc' };

async function cargarPerfil() {
  const yo = st.yo;
  for (const [k, id] of Object.entries(CAMPOS)) $(`#${id}`).value = yo[k] ?? '';
  $('#pf-pub').checked = yo.publico;
  $('#mi-link').textContent = new URL(`index.html?p=${yo.id}`, location.href).href;
  cargarFeed();
  cargarMisServicios();

  const [alq, aus] = await Promise.all([
    sb.from('alquileres').select('*, consultorios(nombre)').eq('profesional_id', yo.id)
      .gte('vigente_hasta', hoy()).order('dia_semana').order('hora_inicio'),
    sb.from('ausencias').select('*').gte('hasta', new Date().toISOString()).order('desde'),
  ]);
  const la = $('#mis-alquileres');
  if (alq.error) aviso(la, mensajeError(alq.error));
  else la.replaceChildren(...(alq.data.length ? alq.data.map((a) => h('div', { class: 'item' },
    h('div', {}, h('strong', {}, `${DIAS[a.dia_semana]} ${hhmm(a.hora_inicio)}–${hhmm(a.hora_fin)}`), ` · ${a.consultorios?.nombre ?? ''}`),
    h('div', { class: 'small muted' }, `${ddmmaa(a.vigente_desde)} al ${ddmmaa(a.vigente_hasta)}`)))
    : [h('p', { class: 'muted small' }, 'No tenés horarios vigentes. Los carga la administración.')]));

  const lz = $('#ausencias');
  if (aus.error) aviso(lz, mensajeError(aus.error));
  else lz.replaceChildren(...aus.data.map((x) => h('div', { class: 'item' },
    h('div', {}, h('strong', {}, `${ddmmaa(fechaLocal(x.desde))} al ${ddmmaa(sumarDias(fechaLocal(x.hasta), -1))}`), x.motivo ? ` · ${x.motivo}` : ''),
    h('button', { class: 'btn link', type: 'button', onclick: async () => {
      const { error } = await sb.from('ausencias').delete().eq('id', x.id);
      if (error) return aviso($('#aus-estado'), mensajeError(error));
      cargarPerfil();
    } }, 'Quitar'))));
}

// ── Mis servicios ──

async function cargarMisServicios() {
  const [sv, ps] = await Promise.all([
    sb.from('servicios').select('*').eq('activo', true).order('orden').order('categoria').order('nombre'),
    sb.from('profesional_servicios').select('*').eq('profesional_id', st.yo.id),
  ]);
  const caja = $('#mis-servicios');
  const error = sv.error || ps.error;
  if (error) return aviso($('#ms-estado'), mensajeError(error));
  const mio = new Map(ps.data.map((x) => [x.servicio_id, x]));
  st.misServicios = sv.data.filter((x) => mio.has(x.id)).map((x) => ({ id: x.id, nombre: x.nombre, duracion: mio.get(x.id).duracion_min || x.duracion_min }));
  if (!sv.data.length) return caja.replaceChildren(h('p', { class: 'muted small' }, 'Todavía no hay servicios cargados. Los carga la administración.'));
  caja.replaceChildren(...sv.data.map((x) => {
    const p = mio.get(x.id);
    const dur = h('input', { type: 'number', min: '10', max: '240', step: '5', value: p?.duracion_min ?? '', placeholder: String(x.duracion_min),
      style: 'width:5.5rem', 'aria-label': `Duración de ${x.nombre} en minutos`, disabled: p ? null : '' });
    dur.addEventListener('change', async () => {
      const v = dur.value ? Number(dur.value) : null;
      const { error: e } = await sb.from('profesional_servicios').update({ duracion_min: v }).eq('profesional_id', st.yo.id).eq('servicio_id', x.id);
      aviso($('#ms-estado'), e ? mensajeError(e) : 'Guardado.', e ? 'error' : 'ok');
      cargarMisServicios();
    });
    const chk = h('input', { type: 'checkbox', checked: p ? '' : null });
    chk.addEventListener('change', async () => {
      const { error: e } = chk.checked
        ? await sb.from('profesional_servicios').insert({ profesional_id: st.yo.id, servicio_id: x.id })
        : await sb.from('profesional_servicios').delete().eq('profesional_id', st.yo.id).eq('servicio_id', x.id);
      aviso($('#ms-estado'), e ? mensajeError(e) : '', e ? 'error' : 'ok');
      cargarMisServicios();
    });
    return h('div', { class: 'item' },
      h('label', { class: 'check' }, chk, h('span', {}, h('strong', {}, x.nombre), h('br'), h('span', { class: 'small muted' }, `${x.categoria}${x.reservable_online ? '' : ' · solo lo agendás vos'}`))),
      h('label', { class: 'small muted row', style: 'gap:.4rem' }, dur, 'min'));
  }));
}

// ── Link de calendario (.ics) ──

async function cargarFeed() {
  const est = $('#feed-estado');
  if (!URL_FEED) return aviso(est, 'Falta configurar el sistema.');
  const { data, error } = await sb.from('calendario_tokens').select('token').eq('profesional_id', st.yo.id).maybeSingle();
  if (error) return aviso(est, mensajeError(error));
  aviso(est, '');
  $('#feed-crear').hidden = Boolean(data);
  $('#feed-caja').hidden = !data;
  if (data) {
    const url = `${URL_FEED}?t=${data.token}`;
    $('#feed-link').textContent = url;
    $('#feed-webcal').href = url.replace(/^https?:/, 'webcal:');
  }
}

$('#feed-crear').addEventListener('click', async () => {
  const { error } = await sb.from('calendario_tokens').insert({ profesional_id: st.yo.id });
  if (error) return aviso($('#feed-estado'), mensajeError(error));
  cargarFeed();
});

$('#feed-regenerar').addEventListener('click', async () => {
  if (!confirm('El link actual va a dejar de funcionar y vas a tener que volver a agregarlo en Google Calendar. ¿Seguir?')) return;
  const { error } = await sb.from('calendario_tokens').update({ token: crypto.randomUUID() }).eq('profesional_id', st.yo.id);
  if (error) return aviso($('#feed-estado'), mensajeError(error));
  cargarFeed();
  aviso($('#feed-estado'), 'Link nuevo generado. Reemplazalo en Google Calendar.', 'ok');
});

$('#feed-copiar').addEventListener('click', async (e) => {
  try { await navigator.clipboard.writeText($('#feed-link').textContent); e.target.textContent = 'Copiado ✓'; }
  catch { prompt('Copiá el link:', $('#feed-link').textContent); }
});

$('#perfil-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const msg = $('#perfil-estado');
  const cambios = Object.fromEntries(Object.entries(CAMPOS).map(([k, id]) => {
    const v = $(`#${id}`).value.trim();
    return [k, $(`#${id}`).type === 'number' ? Number(v) : v];
  }));
  cambios.publico = $('#pf-pub').checked;
  if (cambios.publico && !cambios.nombre) return aviso(msg, 'Para aceptar turnos online completá tu nombre.');
  if (cambios.web && !/^(https:\/\/\S+|[a-z0-9_-]+\/)$/.test(cambios.web)) return aviso(msg, 'El sitio web tiene que empezar con https://');
  if (cambios.foto && !/^(https:\/\/\S+|img\/[\w./-]+)$/.test(cambios.foto)) return aviso(msg, 'El link de la foto tiene que empezar con https://');
  const { data, error } = await sb.from('profesionales').update(cambios).eq('id', st.yo.id).select().single();
  if (error) return aviso(msg, mensajeError(error));
  st.yo = data;
  $('#quien').textContent = data.nombre || data.email;
  aviso(msg, 'Guardado.', 'ok');
  aviso($('#estado'), '');
});

$('#copiar-link').addEventListener('click', async (e) => {
  try { await navigator.clipboard.writeText($('#mi-link').textContent); e.target.textContent = 'Copiado ✓'; }
  catch { prompt('Copiá el link:', $('#mi-link').textContent); }
});

$('#aus-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const msg = $('#aus-estado');
  const d = $('#aus-desde').value, hst = $('#aus-hasta').value;
  if (!d || !hst || hst < d) return aviso(msg, 'Revisá las fechas.');
  const desde = instante(d, '00:00'), hasta = instante(sumarDias(hst, 1), '00:00');
  const { error } = await sb.from('ausencias').insert({ profesional_id: st.yo.id, desde, hasta, motivo: $('#aus-motivo').value.trim() });
  if (error) return aviso(msg, mensajeError(error));
  const { count } = await sb.from('turnos').select('id', { count: 'exact', head: true })
    .eq('estado', 'confirmado').gte('inicio', desde).lt('inicio', hasta);
  $('#aus-form').reset();
  aviso(msg, count
    ? `Ausencia guardada. Ojo: tenés ${count} turno(s) ya dados en esas fechas; cancelalos desde la agenda y avisá a los pacientes.`
    : 'Ausencia guardada.', count ? 'info' : 'ok');
  cargarPerfil();
});

// ───────────────────────── Administración ─────────────────────────

async function cargarAdmin() {
  if (!st.yo.es_admin) return;
  const [c, p, a] = await Promise.all([
    sb.from('consultorios').select('*').order('id'),
    sb.from('profesionales').select('*').order('nombre'),
    sb.from('alquileres').select('*').order('dia_semana').order('hora_inicio'),
  ]);
  const error = c.error || p.error || a.error;
  if (error) return aviso($('#alq-estado'), mensajeError(error));
  st.consultorios = c.data; st.profesionales = p.data; st.alquileres = a.data;

  const nombrePro = (id) => { const x = st.profesionales.find((y) => y.id === id); return x ? (x.nombre || x.email) : '¿?'; };
  const nombreBox = (id) => st.consultorios.find((y) => y.id === id)?.nombre ?? '¿?';

  // Selects del formulario
  $('#alq-pro').replaceChildren(...st.profesionales.filter((x) => x.activo).map((x) => h('option', { value: x.id }, x.nombre || x.email)));
  $('#alq-box').replaceChildren(...st.consultorios.filter((x) => x.activo).map((x) => h('option', { value: x.id }, x.nombre)));
  if (!$('#alq-dias').children.length) {
    $('#alq-dias').replaceChildren(...DIAS.slice(1).map((d, i) => h('label', { class: 'dia-chip' },
      h('input', { type: 'checkbox', value: i + 1, 'aria-label': d }), h('span', {}, d.slice(0, 3)))));
  }
  if (!$('#alq-vd').value) { $('#alq-vd').value = hoy(); $('#alq-vh').value = finDeMes(hoy()); }
  if (!$('#oc-fecha').value) $('#oc-fecha').value = hoy();

  // Ocupación de la semana elegida
  const lunes = lunesDe($('#oc-fecha').value || hoy()), domingo = sumarDias(lunes, 6);
  const enSemana = st.alquileres.filter((x) => x.vigente_desde <= domingo && x.vigente_hasta >= lunes);
  $('#ocupacion').replaceChildren(h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, `Semana del ${ddmm(lunes)}`), DIAS.slice(1).map((d) => h('th', {}, d)))),
    h('tbody', {}, st.consultorios.filter((x) => x.activo).map((box) => h('tr', {},
      h('th', {}, box.nombre),
      [1, 2, 3, 4, 5, 6, 7].map((dia) => h('td', {
        class: 'asignable', tabindex: '0', title: `Asignar ${box.nombre} el ${DIAS[dia].toLowerCase()}`,
        onclick: () => prepararAlquiler(box.id, dia),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); prepararAlquiler(box.id, dia); } },
      }, enSemana
        .filter((x) => x.consultorio_id === box.id && x.dia_semana === dia)
        .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
        .map((x) => h('div', { class: 'blk' }, h('strong', {}, `${hhmm(x.hora_inicio)}–${hhmm(x.hora_fin)}`), h('br'), nombrePro(x.profesional_id))),
      h('span', { class: 'mas', 'aria-hidden': 'true' }, '+'))))))));

  // Lista de alquileres
  const verPasados = $('#alq-pasados').checked;
  const lista = st.alquileres.filter((x) => verPasados || x.vigente_hasta >= hoy());
  $('#alquileres').replaceChildren(...(lista.length ? lista.map((x) => h('div', { class: 'item' },
    h('div', {},
      h('strong', {}, `${DIAS[x.dia_semana]} ${hhmm(x.hora_inicio)}–${hhmm(x.hora_fin)}`), ` · ${nombreBox(x.consultorio_id)} · ${nombrePro(x.profesional_id)}`,
      h('br'), h('span', { class: 'small muted' }, `${ddmmaa(x.vigente_desde)} al ${ddmmaa(x.vigente_hasta)}${x.nota ? ` · ${x.nota}` : ''}`)),
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost sm', type: 'button', onclick: () => renovar(x) }, 'Renovar 1 mes'),
      h('button', { class: 'btn link', type: 'button', onclick: () => terminar(x) }, 'Terminar antes'),
      h('button', { class: 'btn link', type: 'button', onclick: () => borrarAlquiler(x) }, 'Borrar'))))
    : [h('p', { class: 'muted small' }, 'Sin alquileres cargados.')]));

  // Profesionales
  $('#profesionales').replaceChildren(...st.profesionales.map((x) => h('div', { class: 'item' },
    h('div', {}, h('strong', {}, x.nombre || '(sin nombre)'), ` · ${x.email}`, h('br'),
      h('span', { class: 'small muted' }, [x.activo ? 'activo' : 'inactivo', x.es_admin ? 'admin' : null, x.publico ? 'turnos online' : 'sin turnos online'].filter(Boolean).join(' · '))),
    x.id === st.yo.id ? h('span', { class: 'small muted' }, 'vos') : h('div', { class: 'row' },
      h('button', { class: 'btn link', type: 'button', onclick: () => editarPro(x, { activo: !x.activo }) }, x.activo ? 'Desactivar' : 'Activar'),
      h('button', { class: 'btn link', type: 'button', onclick: () => editarPro(x, { es_admin: !x.es_admin }) }, x.es_admin ? 'Quitar admin' : 'Hacer admin')))));

  // Consultorios
  $('#consultorios').replaceChildren(...st.consultorios.map((x) => h('div', { class: 'item' },
    h('div', {}, h('strong', {}, x.nombre), x.activo ? '' : h('span', { class: 'small muted' }, ' · inactivo')),
    h('div', { class: 'row' },
      h('button', { class: 'btn link', type: 'button', onclick: () => editarBox(x, null) }, 'Renombrar'),
      h('button', { class: 'btn link', type: 'button', onclick: () => editarBox(x, { activo: !x.activo }) }, x.activo ? 'Desactivar' : 'Activar')))));
}

$('#oc-fecha').addEventListener('change', cargarAdmin);
$('#alq-pasados').addEventListener('change', cargarAdmin);

/** Desde la grilla: deja el formulario listo con ese consultorio y ese día. */
function prepararAlquiler(boxId, dia) {
  $('#alq-box').value = String(boxId);
  $('#alq-dias').querySelectorAll('input').forEach((c) => { c.checked = Number(c.value) === dia; });
  aviso($('#alq-estado'), '');
  $('#alq-titulo').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#alq-pro').focus({ preventScroll: true });
}

/** Choques con alquileres ya cargados, explicados por día (la base igual los rechaza). */
function choquesAlquiler(filas) {
  const pisa = (a, b) => a.dia_semana === b.dia_semana
    && a.vigente_desde <= b.vigente_hasta && b.vigente_desde <= a.vigente_hasta
    && hhmm(a.hora_inicio) < hhmm(b.hora_fin) && hhmm(b.hora_inicio) < hhmm(a.hora_fin);
  const nombre = (id) => { const x = st.profesionales.find((y) => y.id === id); return x ? (x.nombre || x.email) : 'otro profesional'; };
  const box = (id) => st.consultorios.find((y) => y.id === id)?.nombre ?? 'ese consultorio';
  const out = [];
  for (const f of filas) {
    for (const x of st.alquileres.filter((a) => pisa(a, f))) {
      if (x.consultorio_id === f.consultorio_id) out.push(`${DIAS[f.dia_semana]}: ${box(x.consultorio_id)} ya está alquilado a ${nombre(x.profesional_id)} de ${hhmm(x.hora_inicio)} a ${hhmm(x.hora_fin)}.`);
      else if (x.profesional_id === f.profesional_id) out.push(`${DIAS[f.dia_semana]}: ${nombre(x.profesional_id)} ya tiene ${box(x.consultorio_id)} de ${hhmm(x.hora_inicio)} a ${hhmm(x.hora_fin)}.`);
    }
  }
  return out;
}

$('#alq-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const msg = $('#alq-estado');
  const dias = [...$('#alq-dias').querySelectorAll('input:checked')].map((c) => Number(c.value));
  const base = {
    profesional_id: $('#alq-pro').value, consultorio_id: Number($('#alq-box').value),
    hora_inicio: $('#alq-ini').value, hora_fin: $('#alq-fin').value,
    vigente_desde: $('#alq-vd').value, vigente_hasta: $('#alq-vh').value, nota: $('#alq-nota').value.trim(),
  };
  if (!base.profesional_id || !base.consultorio_id) return aviso(msg, 'Primero cargá profesionales y consultorios.');
  if (!dias.length) return aviso(msg, 'Elegí al menos un día de la semana.');
  if (!base.hora_inicio || !base.hora_fin || base.hora_fin <= base.hora_inicio) return aviso(msg, 'La hora de fin tiene que ser posterior a la de inicio.');
  if (!base.vigente_desde || !base.vigente_hasta || base.vigente_hasta < base.vigente_desde) return aviso(msg, 'Revisá las fechas de vigencia.');
  const filas = dias.map((dia_semana) => ({ ...base, dia_semana }));
  const choques = choquesAlquiler(filas);
  if (choques.length) return aviso(msg, `No se guardó ningún día. ${choques.join(' ')}`);
  // Un solo insert: si un día choca, la base no guarda ninguno.
  const { error } = await sb.from('alquileres').insert(filas);
  if (error) return aviso(msg, `No se guardó ningún día. ${mensajeError(error)}`);
  aviso(msg, `Listo: ${dias.map((d) => DIAS[d].toLowerCase()).join(', ')} de ${base.hora_inicio} a ${base.hora_fin}.`, 'ok');
  $('#alq-nota').value = '';
  cargarAdmin();
});

async function renovar(x) {
  const nuevo = finDeMes(x.vigente_hasta, 1);
  if (!confirm(`Extender hasta el ${ddmmaa(nuevo)}?`)) return;
  const { error } = await sb.from('alquileres').update({ vigente_hasta: nuevo }).eq('id', x.id);
  if (error) return aviso($('#alq-estado'), mensajeError(error));
  cargarAdmin();
}

async function terminar(x) {
  const f = prompt('Último día del alquiler (AAAA-MM-DD):', hoy());
  if (!f) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || f < x.vigente_desde) return aviso($('#alq-estado'), 'Fecha inválida.');
  const { data: n, error: e1 } = await sb.rpc('turnos_en_alquiler', { p_alquiler: x.id, p_desde: sumarDias(f, 1) });
  if (e1) return aviso($('#alq-estado'), mensajeError(e1));
  if (n && !confirm(`Hay ${n} turno(s) de pacientes después del ${ddmmaa(f)} en esta franja. Seguirán en la agenda del profesional, que tendrá que reprogramarlos. ¿Continuar?`)) return;
  const { error } = await sb.from('alquileres').update({ vigente_hasta: f }).eq('id', x.id);
  if (error) return aviso($('#alq-estado'), mensajeError(error));
  cargarAdmin();
}

async function borrarAlquiler(x) {
  const { data: n, error: e1 } = await sb.rpc('turnos_en_alquiler', { p_alquiler: x.id, p_desde: null });
  if (e1) return aviso($('#alq-estado'), mensajeError(e1));
  const extra = n ? `\nHay ${n} turno(s) futuros de pacientes en esta franja: seguirán en la agenda del profesional.` : '';
  if (!confirm(`¿Borrar este alquiler? Si solo termina, usá "Terminar antes" para conservar el historial.${extra}`)) return;
  const { error } = await sb.from('alquileres').delete().eq('id', x.id);
  if (error) return aviso($('#alq-estado'), mensajeError(error));
  cargarAdmin();
}

async function editarPro(x, cambios) {
  const { error } = await sb.from('profesionales').update(cambios).eq('id', x.id);
  if (error) return aviso($('#pros-estado'), mensajeError(error));
  cargarAdmin();
}

async function editarBox(x, cambios) {
  if (!cambios) {
    const nombre = prompt('Nuevo nombre:', x.nombre);
    if (!nombre?.trim()) return;
    cambios = { nombre: nombre.trim() };
  }
  const { error } = await sb.from('consultorios').update(cambios).eq('id', x.id);
  if (error) return aviso($('#box-estado'), mensajeError(error));
  cargarAdmin();
}

$('#box-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const nombre = $('#box-nombre').value.trim();
  if (!nombre) return;
  const { error } = await sb.from('consultorios').insert({ nombre });
  if (error) return aviso($('#box-estado'), /duplicate|unique/i.test(error.message) ? 'Ya existe un consultorio con ese nombre.' : mensajeError(error));
  $('#box-nombre').value = '';
  aviso($('#box-estado'), '');
  cargarAdmin();
});

// ───────────────────────── Servicios y precios (admin) ─────────────────────────

const mesActual = () => hoy().slice(0, 7);
const pr = { servicios: [], obras: [], aranceles: [], ipc: [], ajustes: [], pendientes: null };

async function cargarPrecios() {
  const [sv, os, ar, ip, aj] = await Promise.all([
    sb.from('servicios').select('*').order('orden').order('categoria').order('nombre'),
    sb.from('obras_sociales').select('*').order('nombre'),
    sb.from('aranceles_vigentes').select('*').order('categoria').order('servicio'),
    sb.from('ipc').select('*').order('periodo'),
    sb.from('ajustes').select('*'),
  ]);
  const error = sv.error || os.error || ar.error || ip.error || aj.error;
  if (error) return aviso($('#pr-estado'), mensajeError(error));
  Object.assign(pr, { servicios: sv.data, obras: os.data, aranceles: ar.data, ipc: ip.data, ajustes: aj.data });
  dibujarIpc();
  dibujarPrecios();
  dibujarServicios();
  dibujarObras();
}

function dibujarIpc() {
  const ult = pr.ipc.at(-1);
  const bases = [...new Set(pr.aranceles.filter((a) => a.ajusta_ipc).map((a) => a.periodo_base))].sort();
  const factor = (desde) => pr.ipc.filter((x) => x.periodo >= desde).reduce((f, x) => f * (1 + Number(x.variacion) / 100), 1);
  $('#ipc-resumen').replaceChildren(ult
    ? `Último IPC cargado: ${mesTexto(ult.periodo)} (${String(ult.variacion).replace('.', ',')} %, ${ult.fuente}).`
      + (bases.length ? ` Ajuste acumulado desde ${mesTexto(bases[0])}: ${((factor(bases[0]) - 1) * 100).toFixed(1).replace('.', ',')} %.` : '')
    : 'Todavía no hay meses de IPC cargados: los precios se informan tal cual se cargaron.');
  $('#ipc-red').value = pr.ajustes.find((x) => x.clave === 'redondeo')?.valor ?? '100';
  if (!$('#ipc-mes').value) {
    const [y, m] = (ult?.periodo ?? `${mesActual()}-01`).split('-').map(Number);
    $('#ipc-mes').value = new Date(Date.UTC(y, ult ? m : m - 2, 1)).toISOString().slice(0, 7);
  }
  $('#ipc-lista').replaceChildren(...pr.ipc.slice(-12).reverse().map((x) => h('div', { class: 'item' },
    h('div', {}, h('strong', {}, mesTexto(x.periodo)), ` · ${String(x.variacion).replace('.', ',')} %`),
    h('span', { class: 'small muted' }, x.fuente))));
}

$('#ipc-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const msg = $('#ipc-estado');
  let v;
  try { v = numero($('#ipc-var').value); } catch { v = null; }
  const red = Number($('#ipc-red').value);
  const actual = pr.ajustes.find((x) => x.clave === 'redondeo')?.valor;
  if (red >= 1 && String(red) !== actual) {
    const { error } = await sb.from('ajustes').update({ valor: String(red) }).eq('clave', 'redondeo');
    if (error) return aviso(msg, mensajeError(error));
  }
  if ($('#ipc-var').value.trim()) {
    if (v == null || !$('#ipc-mes').value) return aviso(msg, 'Completá el mes y la variación (ej. 2,1).');
    const { error } = await sb.rpc('cargar_ipc', { p_periodo: `${$('#ipc-mes').value}-01`, p_variacion: v, p_fuente: 'manual' });
    if (error) return aviso(msg, mensajeError(error));
    $('#ipc-var').value = ''; $('#ipc-mes').value = '';
  }
  aviso(msg, 'Guardado. Los precios ya están actualizados.', 'ok');
  cargarPrecios();
});

$('#ipc-buscar').addEventListener('click', async (ev) => {
  const msg = $('#ipc-estado');
  ev.target.disabled = true;
  aviso(msg, 'Consultando INDEC…', 'info');
  const { data, error } = await sb.functions.invoke('ipc', { body: {} });
  ev.target.disabled = false;
  if (error) return aviso(msg, mensajeError(error));
  aviso(msg, data.cargados.length
    ? `Listo: se cargó ${data.cargados.map((x) => `${mesTexto(x.periodo)} (${String(x.variacion).replace('.', ',')} %)`).join(', ')}.`
    : 'No hay meses nuevos publicados todavía.', 'ok');
  cargarPrecios();
});

$('#ipc-rebasar').addEventListener('click', async () => {
  if (!confirm('Los montos base pasan a ser los precios de hoy, y desde ahí se ajustan solo los meses de IPC nuevos. Sirve cuando se revisa la lista completa. ¿Seguir?')) return;
  const { data, error } = await sb.rpc('rebasar_aranceles');
  aviso($('#ipc-estado'), error ? mensajeError(error) : `Listo: ${data} precios tomados como nueva base.`, error ? 'error' : 'ok');
  cargarPrecios();
});

function dibujarPrecios() {
  const sel = $('#pr-cob');
  const elegido = sel.value || 'particular';
  sel.replaceChildren(h('option', { value: 'particular' }, 'Particular'), h('option', { value: 'todas' }, 'Todas las coberturas'),
    ...pr.obras.map((o) => h('option', { value: String(o.id) }, o.nombre)));
  sel.value = elegido;
  const filas = pr.aranceles.filter((a) => elegido === 'todas' || (elegido === 'particular' ? a.obra_social_id == null : String(a.obra_social_id) === elegido));
  $('#pr-tabla').replaceChildren(
    h('thead', {}, h('tr', {}, ['Servicio', elegido === 'todas' ? 'Cobertura' : null, 'Paciente paga', 'Base', 'Hoy', 'Obra social', ''].filter((x) => x !== null).map((x) => h('th', {}, x)))),
    h('tbody', {}, filas.length ? filas.map((a) => h('tr', {},
      h('td', {}, a.servicio, h('br'), h('span', { class: 'small muted' }, a.categoria)),
      elegido === 'todas' ? h('td', {}, a.obra_social) : null,
      h('td', {}, MODALIDAD[a.modalidad]),
      h('td', {}, ['particular', 'copago'].includes(a.modalidad) ? pesos(a.monto) : '—', h('br'), h('span', { class: 'small muted' }, `${mesTexto(a.periodo_base)}${a.ajusta_ipc ? '' : ' · fijo'}`)),
      h('td', {}, h('strong', {}, ['particular', 'copago'].includes(a.modalidad) ? pesos(a.monto_hoy) : '—')),
      h('td', {}, a.valor_os_hoy == null ? '—' : pesos(a.valor_os_hoy)),
      h('td', {}, h('button', { class: 'btn link', type: 'button', onclick: () => abrirPrecio(a) }, 'Editar')))) : [h('tr', {}, h('td', { colspan: '7' }, 'Sin precios cargados para esta cobertura.'))]));
}
$('#pr-cob').addEventListener('change', dibujarPrecios);

const dlgPrecio = $('#dlg-precio');
function abrirPrecio(a = null) {
  $('#pf2-serv').replaceChildren(...pr.servicios.map((x) => h('option', { value: String(x.id) }, x.nombre)));
  $('#pf2-cob').replaceChildren(h('option', { value: '' }, 'Particular'), ...pr.obras.map((o) => h('option', { value: String(o.id) }, o.nombre)));
  const cob = $('#pr-cob').value;
  $('#pf2-serv').value = a ? String(a.servicio_id) : $('#pf2-serv').value;
  $('#pf2-cob').value = a ? (a.obra_social_id == null ? '' : String(a.obra_social_id)) : (/^\d+$/.test(cob) ? cob : '');
  $('#pf2-mod').value = a?.modalidad ?? ($('#pf2-cob').value ? 'cubierto' : 'particular');
  $('#pf2-monto').value = a && ['particular', 'copago'].includes(a.modalidad) ? a.monto_hoy : '';
  $('#pf2-vos').value = a?.valor_os_hoy ?? '';
  $('#pf2-mes').value = mesActual();
  $('#pf2-ipc').checked = a ? a.ajusta_ipc : true;
  $('#pf2-serv').disabled = $('#pf2-cob').disabled = Boolean(a);
  aviso($('#precio-estado'), a ? 'Los montos se muestran a valores de hoy y se guardan con el mes actual como base.' : '', 'info');
  dlgPrecio.showModal();
}
$('#pr-nuevo').addEventListener('click', () => abrirPrecio());
$('#pf2-cerrar').addEventListener('click', () => dlgPrecio.close());

$('#precio-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const msg = $('#precio-estado');
  const os = $('#pf2-cob').value;
  const mod = $('#pf2-mod').value;
  if (!os && mod !== 'particular') return aviso(msg, 'Sin obra social, la modalidad es "Particular".');
  if (os && mod === 'particular') return aviso(msg, 'Con obra social elegí cubierto, adicional o no cubre.');
  let monto, vos;
  try { monto = numero($('#pf2-monto').value); vos = numero($('#pf2-vos').value); } catch (e) { return aviso(msg, e.message); }
  if (['particular', 'copago'].includes(mod) && monto == null) return aviso(msg, 'Completá el monto que paga el paciente.');
  const serv = pr.servicios.find((x) => String(x.id) === $('#pf2-serv').value);
  const { error } = await sb.rpc('importar_aranceles', { p_filas: [{
    servicio: serv.nombre, obra_social: os ? pr.obras.find((o) => String(o.id) === os).nombre : '', modalidad: mod,
    monto: monto ?? '', valor_os: vos ?? '', periodo_base: `${$('#pf2-mes').value}-01`, ajusta_ipc: $('#pf2-ipc').checked,
  }] });
  if (error) return aviso(msg, mensajeError(error));
  dlgPrecio.close();
  cargarPrecios();
});

// ── Planilla ──

function descargar(nombre, texto) {
  const a = h('a', { href: URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' })), download: nombre });
  document.body.append(a); a.click(); a.remove();
}

$('#pl-plantilla').addEventListener('click', () => descargar('plantilla-precios.csv', aCsv([
  { servicio: 'Primera consulta y diagnóstico', categoria: 'Consultas', descripcion: 'Revisión completa y plan de tratamiento.', duracion_min: 40, reservable_online: true, obra_social: '', modalidad: 'particular', monto: 30000, valor_os: '', periodo_base: `${mesActual()}-01`, ajusta_ipc: true },
  { servicio: 'Primera consulta y diagnóstico', obra_social: 'IPROSS', modalidad: 'cubierto', valor_os: 18000, periodo_base: `${mesActual()}-01`, ajusta_ipc: false },
])));

$('#pl-exportar').addEventListener('click', () => {
  const sv = new Map(pr.servicios.map((x) => [x.id, x]));
  descargar(`precios-${hoy()}.csv`, aCsv(pr.aranceles.map((a) => {
    const s = sv.get(a.servicio_id);
    return { servicio: a.servicio, categoria: a.categoria, descripcion: s?.descripcion, duracion_min: s?.duracion_min, reservable_online: s?.reservable_online,
      obra_social: a.obra_social_id == null ? '' : a.obra_social, modalidad: a.modalidad, monto: a.monto, valor_os: a.valor_os,
      periodo_base: a.periodo_base, ajusta_ipc: a.ajusta_ipc, monto_hoy: a.monto_hoy };
  }), [...['servicio', 'categoria', 'descripcion', 'duracion_min', 'reservable_online', 'obra_social', 'modalidad', 'monto', 'valor_os', 'periodo_base', 'ajusta_ipc'], 'monto_hoy']));
});

$('#pl-archivo').addEventListener('change', async (ev) => {
  const archivo = ev.target.files[0];
  ev.target.value = '';
  if (!archivo) return;
  const msg = $('#pl-estado');
  try {
    const matriz = /\.xlsx$/i.test(archivo.name) ? await leerExcel(await archivo.arrayBuffer()) : leerCsv(await archivo.text());
    const { filas, errores } = interpretar(matriz);
    pr.pendientes = errores.length ? null : filas;
    $('#pl-confirmar').hidden = !pr.pendientes;
    if (errores.length) return aviso(msg, `No se importó nada. Corregí y volvé a subir: ${errores.slice(0, 6).join(' · ')}${errores.length > 6 ? ` (y ${errores.length - 6} más)` : ''}`);
    const servs = new Set(filas.map((f) => f.servicio.toLowerCase())).size;
    const obras = new Set(filas.filter((f) => f.obra_social).map((f) => f.obra_social.toLowerCase())).size;
    aviso(msg, `${archivo.name}: ${filas.length} filas, ${servs} servicios, ${obras} obras sociales. ¿Importar?`, 'info');
  } catch (e) {
    aviso(msg, `No se pudo leer el archivo: ${e.message}`);
  }
});
$('#pl-cancelar').addEventListener('click', () => { pr.pendientes = null; $('#pl-confirmar').hidden = true; aviso($('#pl-estado'), ''); });
$('#pl-importar').addEventListener('click', async () => {
  const { data, error } = await sb.rpc('importar_aranceles', { p_filas: pr.pendientes });
  $('#pl-confirmar').hidden = true; pr.pendientes = null;
  aviso($('#pl-estado'), error ? mensajeError(error) : `Listo: ${data.filas} filas importadas.`, error ? 'error' : 'ok');
  cargarPrecios();
});

// ── Servicios y obras sociales ──

function dibujarServicios() {
  $('#sv-lista').replaceChildren(...pr.servicios.map((x) => {
    const dur = h('input', { type: 'number', min: '10', max: '240', step: '5', value: x.duracion_min, style: 'width:5.5rem', 'aria-label': `Duración de ${x.nombre}` });
    dur.addEventListener('change', () => editarServicio(x, { duracion_min: Number(dur.value) }));
    return h('div', { class: 'item' },
      h('div', {}, h('strong', {}, x.nombre), x.activo ? '' : h('span', { class: 'small muted' }, ' · inactivo'), h('br'),
        h('span', { class: 'small muted' }, `${x.categoria}${x.descripcion ? ` · ${x.descripcion}` : ''}`)),
      h('div', { class: 'row' },
        h('label', { class: 'small muted row', style: 'gap:.4rem' }, dur, 'min'),
        h('button', { class: 'btn link', type: 'button', onclick: () => editarServicio(x, { reservable_online: !x.reservable_online }) }, x.reservable_online ? 'Online: sí' : 'Online: no'),
        h('button', { class: 'btn link', type: 'button', onclick: () => editarServicio(x, { activo: !x.activo }) }, x.activo ? 'Desactivar' : 'Activar')));
  }));
  if (!pr.servicios.length) $('#sv-lista').replaceChildren(h('p', { class: 'muted small' }, 'Sin servicios. Se crean al importar la planilla.'));
}

async function editarServicio(x, cambios) {
  const { error } = await sb.from('servicios').update(cambios).eq('id', x.id);
  aviso($('#sv-estado'), error ? mensajeError(error) : '');
  cargarPrecios();
}

function dibujarObras() {
  $('#os-lista').replaceChildren(...pr.obras.map((x) => h('div', { class: 'item' },
    h('div', {}, h('strong', {}, x.nombre), x.activo ? '' : h('span', { class: 'small muted' }, ' · no se ofrece al reservar')),
    h('button', { class: 'btn link', type: 'button', onclick: async () => {
      const { error } = await sb.from('obras_sociales').update({ activo: !x.activo }).eq('id', x.id);
      aviso($('#os-estado'), error ? mensajeError(error) : '');
      cargarPrecios();
    } }, x.activo ? 'Desactivar' : 'Activar'))));
}

$('#os-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const nombre = $('#os-nombre').value.trim();
  if (!nombre) return;
  const { error } = await sb.from('obras_sociales').insert({ nombre });
  if (error) return aviso($('#os-estado'), /duplicate|unique/i.test(error.message) ? 'Ya existe esa obra social.' : mensajeError(error));
  $('#os-nombre').value = '';
  aviso($('#os-estado'), '');
  cargarPrecios();
});

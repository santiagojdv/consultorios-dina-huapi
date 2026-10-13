import {
  sb, configurado, faltaConfig, $, h, aviso, mensajeError, DIAS,
  hora, diaLargo, diaDeFecha, fechaLocal, sumarDias, lunesDe, instante, linkWhatsApp, URL_FEED,
} from './comun.js';

const st = { yo: null, semana: null, consultorios: [], profesionales: [], alquileres: [], cal: { semana: null, dia: null, datos: [] } };
const hoy = () => fechaLocal(new Date());
const ddmm = (iso) => iso.split('-').reverse().slice(0, 2).join('/');
const ddmmaa = (iso) => iso.split('-').reverse().join('/');
const hhmm = (t) => t.slice(0, 5);
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
  $('#tab-admin').hidden = !yo.es_admin;
  if (!yo.nombre) {
    aviso($('#estado'), 'Primer ingreso: completá tus datos en "Mi perfil" para poder recibir turnos online.', 'info');
  }
  cargarSemana(lunesDe(hoy()));
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
  if (tab.dataset.tab === 'agenda') cargarSemana(st.semana);
  if (tab.dataset.tab === 'calendario') cargarCalendario(st.cal.semana || lunesDe(hoy()), st.cal.dia);
  if (tab.dataset.tab === 'perfil') cargarPerfil();
  if (tab.dataset.tab === 'admin') cargarAdmin();
}));

// ───────────────────────── Agenda ─────────────────────────

async function cargarSemana(lunes) {
  st.semana = lunes;
  const domingo = sumarDias(lunes, 6);
  $('#ag-titulo').textContent = `${diaDeFecha(lunes)} – ${diaDeFecha(domingo)}`;
  const est = $('#ag-estado');
  aviso(est, 'Cargando…', 'info');

  const [turnos, libres] = await Promise.all([
    sb.from('turnos').select('*')
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
    t.nota ? h('span', { class: 'muted small' }, t.nota) : null,
    h('span', { class: 'acciones' },
      h('a', { href: linkWhatsApp(t.paciente_telefono, texto), target: '_blank', rel: 'noopener' }, cancelado ? 'Avisar por WhatsApp' : 'WhatsApp'),
      cancelado ? null : h('a', { href: `tel:${t.paciente_telefono}` }, 'Llamar'),
      cancelado ? null : h('button', { class: 'btn link', type: 'button', onclick: () => cancelarTurno(t) }, 'Cancelar')));
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
  aviso($('#turno-estado'), '');
  dlg.showModal();
  (hh ? $('#t-nombre') : $('#t-hora')).focus();
}
$('#nuevo-turno').addEventListener('click', () => abrirTurno());
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
  });
  if (error) return aviso(msg, mensajeError(error));
  dlg.close();
  cargarSemana(lunesDe(fecha));
});

// ───────────────────────── Calendario consolidado ─────────────────────────
// Vista por día: una columna por consultorio, alquileres como franjas y turnos encima.

const PX_MIN = 1.1; // alto de un minuto en la grilla
const minDelDia = (iso) => { const [a, b] = hora(iso).split(':').map(Number); return a * 60 + b; };

async function cargarCalendario(lunes, dia) {
  st.cal.semana = lunes;
  if (dia) st.cal.dia = dia;
  const domingo = sumarDias(lunes, 6);
  $('#cal-titulo').textContent = `${diaDeFecha(lunes)} – ${diaDeFecha(domingo)}`;
  aviso($('#cal-estado'), 'Cargando…', 'info');
  const [oc, bx] = await Promise.all([
    sb.rpc('ocupacion', { p_desde: lunes, p_hasta: domingo }),
    sb.from('consultorios').select('*').eq('activo', true).order('id'),
  ]);
  if (st.cal.semana !== lunes) return;
  const error = oc.error || bx.error;
  if (error) return aviso($('#cal-estado'), mensajeError(error));
  aviso($('#cal-estado'), '');
  st.cal.datos = oc.data;
  st.consultorios = bx.data;
  // El día elegido puede haber cambiado mientras cargaba: se respeta el último.
  const d = st.cal.dia;
  st.cal.dia = d && d >= lunes && d <= domingo ? d : (hoy() >= lunes && hoy() <= domingo ? hoy() : lunes);
  dibujarCalendario();
}

function dibujarCalendario() {
  const { semana, dia, datos } = st.cal;

  // Colores estables por profesional (orden alfabético)
  const pros = [...new Map(datos.map((x) => [x.profesional_id, x.profesional])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const color = new Map(pros.map(([id], i) => [id, `var(--p${(i % 6) + 1})`]));

  // Tira de días con cantidad de turnos
  $('#cal-dias').replaceChildren(...[0, 1, 2, 3, 4, 5, 6].map((i) => {
    const f = sumarDias(semana, i);
    const n = datos.filter((x) => x.tipo === 'turno' && fechaLocal(x.inicio) === f).length;
    const [nombre, num] = diaDeFecha(f).replace(',', '').split(' ');
    return h('button', {
      type: 'button', class: f === hoy() ? 'hoy' : null, 'aria-pressed': String(f === dia),
      onclick: () => { st.cal.dia = f; dibujarCalendario(); },
    }, nombre, h('strong', {}, num), h('span', {}, n ? `${n} turno${n === 1 ? '' : 's'}` : '—'));
  }));

  $('#cal-leyenda').replaceChildren(...pros.map(([id, nombre]) => h('span', { style: `--c:${color.get(id)}` }, h('i'), id === st.yo.id ? `${nombre} (vos)` : nombre)));

  const delDia = datos.filter((x) => fechaLocal(x.inicio) === dia);
  const boxes = st.consultorios;
  const grilla = $('#cal-grilla');
  if (!boxes.length) { grilla.replaceChildren(); return aviso($('#cal-estado'), 'Todavía no hay consultorios cargados.', 'info'); }

  // Rango horario: lo ocupado ese día, como mínimo 8 a 20
  let desde = 8 * 60, hasta = 20 * 60;
  for (const x of delDia) { desde = Math.min(desde, minDelDia(x.inicio)); hasta = Math.max(hasta, minDelDia(x.fin) || 24 * 60); }
  desde = Math.floor(desde / 60) * 60; hasta = Math.ceil(hasta / 60) * 60;
  const y = (m) => `${(m - desde) * PX_MIN}px`;
  grilla.style.setProperty('--cols', boxes.length);
  grilla.style.setProperty('--alto', `${(hasta - desde) * PX_MIN}px`);
  grilla.style.setProperty('--hora', `${60 * PX_MIN}px`);

  const horas = h('div', { class: 'cal-horas' });
  for (let m = desde + 60; m < hasta; m += 60) horas.append(h('span', { style: `top:${y(m)}` }, `${String(m / 60).padStart(2, '0')}:00`));

  const ahora = dia === hoy() ? minDelDia(new Date().toISOString()) : null;
  const columnas = boxes.map((b) => {
    const col = h('div', { class: 'cal-col' });
    for (const x of delDia.filter((z) => z.consultorio_id === b.id).sort((p, q) => (p.tipo === q.tipo ? 0 : p.tipo === 'alquiler' ? -1 : 1))) {
      const ini = minDelDia(x.inicio), fin = minDelDia(x.fin) || 24 * 60;
      const pos = `top:${y(ini)};height:${(fin - ini) * PX_MIN - 2}px;--c:${color.get(x.profesional_id)}`;
      const rango = `${hora(x.inicio)}–${hora(x.fin)}`;
      if (x.tipo === 'alquiler') {
        col.append(h('div', { class: 'cal-alq', style: pos, title: `${x.profesional} · ${rango}` }, h('b', {}, x.profesional), rango));
      } else {
        col.append(x.propio
          ? h('div', { class: 'cal-tur propio', style: pos, title: `${rango} · ${x.paciente}` }, `${hora(x.inicio)} ${x.paciente}`)
          : h('div', { class: 'cal-tur ajeno', style: pos, title: `${rango} · ocupado (${x.profesional})` }, `${hora(x.inicio)} · ${x.profesional}`));
      }
    }
    if (ahora != null && ahora > desde && ahora < hasta) col.append(h('div', { class: 'cal-ahora', style: `top:${y(ahora)}`, title: 'Ahora' }));
    return col;
  });

  grilla.replaceChildren(
    h('div', { class: 'cal-head' }), ...boxes.map((b) => h('div', { class: 'cal-head' }, b.nombre)),
    horas, ...columnas,
  );
  if (!delDia.length) aviso($('#cal-estado'), `Sin alquileres ni turnos el ${diaLargo(instante(dia, '12:00'))}.`, 'info');
}

$('#cal-ant').addEventListener('click', () => cargarCalendario(sumarDias(st.cal.semana, -7), sumarDias(st.cal.dia, -7)));
$('#cal-sig').addEventListener('click', () => cargarCalendario(sumarDias(st.cal.semana, 7), sumarDias(st.cal.dia, 7)));
$('#cal-hoy').addEventListener('click', () => cargarCalendario(lunesDe(hoy()), hoy()));

// ───────────────────────── Perfil ─────────────────────────

const CAMPOS = { nombre: 'pf-nombre', especialidad: 'pf-esp', telefono: 'pf-tel', duracion_turno: 'pf-dur',
  anticipacion_horas: 'pf-ant', ventana_dias: 'pf-ven', aviso_cancelacion_horas: 'pf-canc' };

async function cargarPerfil() {
  const yo = st.yo;
  for (const [k, id] of Object.entries(CAMPOS)) $(`#${id}`).value = yo[k] ?? '';
  $('#pf-pub').checked = yo.publico;
  $('#mi-link').textContent = new URL(`index.html?p=${yo.id}`, location.href).href;
  cargarFeed();

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
  if (!$('#alq-dia').options.length) $('#alq-dia').replaceChildren(...DIAS.slice(1).map((d, i) => h('option', { value: i + 1 }, d)));
  if (!$('#alq-vd').value) { $('#alq-vd').value = hoy(); $('#alq-vh').value = finDeMes(hoy()); }
  if (!$('#oc-fecha').value) $('#oc-fecha').value = hoy();

  // Ocupación de la semana elegida
  const lunes = lunesDe($('#oc-fecha').value || hoy()), domingo = sumarDias(lunes, 6);
  const enSemana = st.alquileres.filter((x) => x.vigente_desde <= domingo && x.vigente_hasta >= lunes);
  $('#ocupacion').replaceChildren(h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, `Semana del ${ddmm(lunes)}`), DIAS.slice(1).map((d) => h('th', {}, d)))),
    h('tbody', {}, st.consultorios.filter((x) => x.activo).map((box) => h('tr', {},
      h('th', {}, box.nombre),
      [1, 2, 3, 4, 5, 6, 7].map((dia) => h('td', {}, enSemana
        .filter((x) => x.consultorio_id === box.id && x.dia_semana === dia)
        .map((x) => h('div', { class: 'blk' }, h('strong', {}, `${hhmm(x.hora_inicio)}–${hhmm(x.hora_fin)}`), h('br'), nombrePro(x.profesional_id))))))))));

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

$('#alq-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const msg = $('#alq-estado');
  const fila = {
    profesional_id: $('#alq-pro').value, consultorio_id: Number($('#alq-box').value), dia_semana: Number($('#alq-dia').value),
    hora_inicio: $('#alq-ini').value, hora_fin: $('#alq-fin').value,
    vigente_desde: $('#alq-vd').value, vigente_hasta: $('#alq-vh').value, nota: $('#alq-nota').value.trim(),
  };
  if (!fila.profesional_id || !fila.consultorio_id) return aviso(msg, 'Primero cargá profesionales y consultorios.');
  if (!fila.hora_inicio || !fila.hora_fin || fila.hora_fin <= fila.hora_inicio) return aviso(msg, 'La hora de fin tiene que ser posterior a la de inicio.');
  if (!fila.vigente_desde || !fila.vigente_hasta || fila.vigente_hasta < fila.vigente_desde) return aviso(msg, 'Revisá las fechas de vigencia.');
  const { error } = await sb.from('alquileres').insert(fila);
  if (error) return aviso(msg, mensajeError(error));
  aviso(msg, 'Alquiler agregado.', 'ok');
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

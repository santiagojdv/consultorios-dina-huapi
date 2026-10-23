// Bandeja de WhatsApp del panel: conversaciones del asistente, derivaciones y respuestas de una persona.
// La usan panel.js (pestaña WhatsApp) y la demo del asistente (herramientas/asistente-demo).
import { sb, h, aviso, mensajeError, hora, diaCorto, fechaLocal } from './comun.js';

const nombreDe = (c) => c.nombre || `+${c.telefono}`;
const cuando = (iso) => (fechaLocal(iso) === fechaLocal(new Date()) ? hora(iso) : `${diaCorto(iso)} ${hora(iso)}`);
const AUTOR = { paciente: '', asistente: 'Asistente', persona: 'Respuesta de una persona', sistema: '' };

/**
 * Monta la bandeja en `raiz` y la refresca cada `cadaMs`. Devuelve { refrescar, detener }.
 * `alCambiar(cantidad)` recibe cuántas conversaciones esperan a una persona (para un contador).
 */
export function montarBandeja(raiz, { cadaMs = 15000, alCambiar = () => {} } = {}) {
  const st = { lista: [], abierta: null, mensajes: [], timer: null, enviando: false };
  const estado = h('div');
  const lista = h('div', { class: 'wa-lista', role: 'list' });
  const chat = h('div', { class: 'wa-chat' });
  raiz.replaceChildren(h('div', { class: 'wa-bandeja' }, h('div', { class: 'wa-col' }, estado, lista), chat));

  async function refrescar() {
    const { data, error } = await sb.from('wa_conversaciones').select('*').order('ultimo_mensaje');
    if (error) return aviso(estado, mensajeError(error));
    aviso(estado, '');
    st.lista = data.reverse().sort((a, b) => (a.estado === 'humano' ? 0 : 1) - (b.estado === 'humano' ? 0 : 1));
    alCambiar(st.lista.filter((c) => c.estado === 'humano').length);
    dibujarLista();
    if (st.abierta) await abrir(st.abierta, false);
  }

  function dibujarLista() {
    if (!st.lista.length) {
      lista.replaceChildren(h('p', { class: 'muted small' }, 'Todavía no hay conversaciones. Cuando un paciente escriba al WhatsApp del consultorio, aparece acá.'));
      return;
    }
    lista.replaceChildren(...st.lista.map((c) => h('button', {
      class: `wa-conv${c.telefono === st.abierta ? ' activa' : ''}${c.estado === 'humano' ? ' humano' : ''}`, type: 'button', role: 'listitem',
      onclick: () => abrir(c.telefono),
    },
    h('span', { class: 'row between' }, h('strong', {}, nombreDe(c)), h('span', { class: 'small muted' }, cuando(c.ultimo_mensaje))),
    h('span', { class: 'row' },
      c.estado === 'humano' ? h('span', { class: 'badge wa-badge-humano' }, 'Para vos') : h('span', { class: 'badge' }, 'Asistente'),
      c.no_leidos ? h('span', { class: 'wa-noleidos', 'aria-label': `${c.no_leidos} sin leer` }, String(c.no_leidos)) : null),
    c.estado === 'humano' && c.motivo_derivacion ? h('span', { class: 'small muted' }, c.motivo_derivacion) : null)));
  }

  async function abrir(tel, marcar = true) {
    st.abierta = tel;
    const c = st.lista.find((x) => x.telefono === tel);
    if (!c) return;
    const { data, error } = await sb.from('wa_mensajes').select('*').eq('telefono', tel).order('id');
    if (error) return aviso(estado, mensajeError(error));
    st.mensajes = data;
    if (marcar && c.no_leidos) {
      await sb.from('wa_conversaciones').update({ no_leidos: 0 }).eq('telefono', tel);
      c.no_leidos = 0;
    }
    dibujarLista();
    dibujarChat(c);
  }

  function dibujarChat(c) {
    const borrador = chat.querySelector('textarea')?.value ?? '';
    const ventanaAbierta = c.ultimo_entrante && Date.parse(c.ultimo_entrante) > Date.now() - 24 * 3600e3;
    const msj = h('div');
    const caja = h('textarea', { rows: '2', maxlength: '4000', placeholder: ventanaAbierta ? 'Escribí tu respuesta…' : 'Pasaron más de 24 h: WhatsApp no deja escribir hasta que el paciente vuelva a escribir', 'aria-label': 'Respuesta' });
    caja.value = borrador;
    const enviar = h('button', { class: 'btn sm', type: 'submit', disabled: !ventanaAbierta || st.enviando }, 'Enviar');
    const burbujas = h('div', { class: 'wa-msjs' }, ...st.mensajes.map((m) => (m.autor === 'sistema'
      ? h('div', { class: 'wa-nota' }, m.texto)
      : h('div', { class: `wa-msj ${m.direccion} ${m.autor}` },
        AUTOR[m.autor] ? h('span', { class: 'wa-autor' }, AUTOR[m.autor]) : null,
        h('span', { class: 'wa-texto' }, m.texto),
        h('span', { class: 'wa-hora' }, cuando(m.creado))))));

    chat.replaceChildren(
      h('div', { class: 'wa-cab' },
        h('div', {}, h('strong', {}, nombreDe(c)), h('div', { class: 'small muted' }, `+${c.telefono}`)),
        c.estado === 'humano'
          ? h('button', { class: 'btn ghost sm', type: 'button', onclick: () => cambiarEstado(c, 'bot') }, 'Devolver al asistente')
          : h('button', { class: 'btn ghost sm', type: 'button', onclick: () => cambiarEstado(c, 'humano') }, 'Tomar la conversación')),
      h('p', { class: 'small muted' }, c.estado === 'humano'
        ? 'El asistente no responde en este chat hasta que lo devuelvas.'
        : 'Responde el asistente. Si escribís vos, la conversación pasa a tus manos.'),
      burbujas,
      h('form', { class: 'wa-responder', onsubmit: async (ev) => {
        ev.preventDefault();
        const texto = caja.value.trim();
        if (!texto) return;
        st.enviando = true; enviar.disabled = true;
        const { data, error } = await sb.functions.invoke('whatsapp', { body: { accion: 'enviar', telefono: c.telefono, texto } });
        st.enviando = false;
        const falla = error ? (await error.context?.json?.().catch(() => null))?.error ?? error.message : data?.error;
        if (falla) { enviar.disabled = false; return aviso(msj, falla); }
        caja.value = '';
        await refrescar();
      } }, caja, enviar),
      msj);
    burbujas.scrollTop = burbujas.scrollHeight;
  }

  async function cambiarEstado(c, estadoNuevo) {
    const { error } = await sb.from('wa_conversaciones').update({ estado: estadoNuevo }).eq('telefono', c.telefono);
    if (error) return aviso(estado, mensajeError(error));
    await refrescar();
  }

  refrescar();
  st.timer = setInterval(() => { if (!document.hidden && raiz.isConnected && !raiz.closest('[hidden]')) refrescar(); }, cadaMs);
  return { refrescar, detener: () => clearInterval(st.timer) };
}

/** Ajustes del asistente para la administración: encendido, información que usa y quién atiende la bandeja. */
export async function montarAjustesBot(raiz) {
  const est = h('div');
  const [aj, pros] = await Promise.all([
    sb.from('ajustes').select('*'),
    sb.from('profesionales').select('*').order('nombre'),
  ]);
  const error = aj.error || pros.error;
  if (error) return raiz.replaceChildren(h('div', { class: 'aviso error' }, mensajeError(error)));
  const valor = (k, def) => aj.data.find((x) => x.clave === k)?.valor ?? def;
  const guardar = async (clave, v) => {
    const { error: e } = await sb.from('ajustes').update({ valor: String(v) }).eq('clave', clave);
    aviso(est, e ? mensajeError(e) : 'Guardado.', e ? 'error' : 'ok');
  };

  const activo = h('input', { type: 'checkbox', checked: valor('bot_activo', 'true') === 'true', onchange: (ev) => guardar('bot_activo', ev.target.checked) });
  const info = h('textarea', { id: 'bot-info', rows: '14', maxlength: '6000' });
  info.value = valor('bot_info', '');
  const retoma = h('input', { id: 'bot-retoma', type: 'number', min: '1', max: '168', value: valor('bot_retoma_horas', '24') });

  raiz.replaceChildren(
    h('label', { class: 'check' }, activo, h('span', {}, h('strong', {}, 'Asistente encendido. '), 'Si lo apagás, nadie contesta automáticamente y todos los mensajes quedan en la bandeja.')),
    h('div', { class: 'field' }, h('label', { for: 'bot-info' }, 'Información del consultorio que usa el asistente'),
      h('p', { class: 'small muted', style: 'margin:0' }, 'Horarios, dirección, medios de pago, qué traer, políticas. Lo que no esté acá (ni en precios y agenda) el asistente no lo sabe y ofrece derivar.'), info),
    h('div', { class: 'row' },
      h('div', { class: 'field' }, h('label', { for: 'bot-retoma' }, 'Una conversación derivada vuelve al asistente tras (horas sin mensajes)'), retoma)),
    h('div', {}, h('button', { class: 'btn sm', type: 'button', onclick: async () => {
      await guardar('bot_info', info.value.trim());
      const n = Math.min(Math.max(Number(retoma.value) || 24, 1), 168);
      await guardar('bot_retoma_horas', n);
    } }, 'Guardar')),
    h('div', { class: 'stack' }, h('h3', {}, 'Quién atiende la bandeja'),
      h('p', { class: 'small muted' }, 'Ven las conversaciones (son datos de pacientes) y reciben las derivaciones.'),
      h('div', { class: 'lista' }, ...pros.data.filter((p) => p.activo).map((p) => h('label', { class: 'item check', style: 'justify-content:flex-start' },
        h('input', { type: 'checkbox', checked: p.atiende_whatsapp, onchange: async (ev) => {
          const { error: e } = await sb.from('profesionales').update({ atiende_whatsapp: ev.target.checked }).eq('id', p.id);
          aviso(est, e ? mensajeError(e) : 'Guardado.', e ? 'error' : 'ok');
        } }),
        h('span', {}, p.nombre || p.email))))),
    est);
}

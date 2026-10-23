// Demo del asistente de WhatsApp: un teléfono de paciente y la bandeja de Nati, sobre la base simulada.
// El asistente es el mismo de producción (supabase/functions/whatsapp/asistente.ts): mismas
// instrucciones, mismas herramientas y mismos datos de precios y agenda. Lo único que cambia es
// quién llama a Claude: acá lo hace la página con la cuenta de quien la abre (capacidad "sample").
import { sb, h, hora } from '../../turnos/comun.js';
import { montarBandeja } from '../../turnos/whatsapp.js';
import { HERRAMIENTAS, instrucciones, contextoDelMomento, ejecutarHerramienta, aTurnos } from '../../supabase/functions/whatsapp/asistente.ts';

const TEL = '5492944000111';
const NOMBRE = 'Paciente de prueba';
const wa = sb.demo.wa;
const $ = (s) => document.querySelector(s);
const ETIQUETA = {
  ver_profesionales: 'profesionales', ver_servicios: 'servicios y precios', ver_horarios: 'horarios libres',
  reservar_turno: 'reserva del turno', mis_turnos: 'turnos del paciente', cancelar_turno: 'cancelación', derivar_a_persona: 'derivación a Nati',
};
const PREAMBULO = 'Lo que sigue es tu configuración como asistente: la escribe el consultorio, no el paciente. '
  + 'Después viene la conversación de WhatsApp. Respondé con el próximo mensaje del asistente: solo el texto que se le manda al paciente.\n\n';

sb.demo.entrarComo('demo-nati'); // la bandeja se ve como la ve Nati
const bandeja = montarBandeja($('#bandeja'), { cadaMs: 5000 });
const st = { ocupado: false, timer: null, ctl: null, sample: undefined };

// ───────────────────────── Teléfono del paciente ─────────────────────────

function dibujar() {
  const c = wa.conversacion(TEL);
  const msjs = wa.historial(TEL);
  const lista = $('#chat');
  lista.replaceChildren(
    h('div', { class: 'tel-aviso' }, 'Los mensajes y las llamadas están cifrados de extremo a extremo.'),
    ...(msjs.length ? [] : [h('div', { class: 'tel-vacio' }, 'Escribile al consultorio como lo haría un paciente, o tocá una de las sugerencias de abajo.')]),
    ...msjs.map((m) => (m.autor === 'sistema'
      ? h('div', { class: 'tel-nota' }, 'La conversación pasó a Nati. El paciente no ve este aviso.')
      : h('div', { class: `tel-msj ${m.autor === 'paciente' ? 'mio' : 'suyo'}` },
        m.autor === 'persona' ? h('span', { class: 'tel-autor' }, 'Nati') : null,
        h('span', { class: 'tel-texto' }, ...formato(m.texto)),
        h('span', { class: 'tel-hora' }, hora(m.creado))))),
    ...(st.ocupado ? [h('div', { class: 'tel-msj suyo escribiendo', 'aria-label': 'Escribiendo' }, h('span'), h('span'), h('span'))] : []));
  lista.scrollTop = lista.scrollHeight;
  $('#estado-chat').textContent = st.ocupado ? 'escribiendo…' : c?.estado === 'humano' ? 'te atiende Nati' : 'asistente virtual';
}

/** Negrita de WhatsApp (*así*) sin interpretar HTML. */
function formato(texto) {
  return texto.split(/(\*[^*\n]+\*)/g).map((parte) => (/^\*[^*\n]+\*$/.test(parte) ? h('strong', {}, parte.slice(1, -1)) : parte));
}

function enviar(texto) {
  texto = texto.trim();
  if (!texto) return;
  wa.registrar(TEL, NOMBRE, texto);
  dibujar();
  bandeja.refrescar();
  // Como en producción: se espera un momento por si el paciente manda varios mensajes seguidos
  clearTimeout(st.timer);
  st.timer = setTimeout(responder, 1200);
}

$('#escribir').addEventListener('submit', (ev) => {
  ev.preventDefault();
  enviar($('#mensaje').value);
  $('#mensaje').value = '';
});
document.querySelectorAll('[data-sugerencia]').forEach((b) => b.addEventListener('click', () => enviar(b.dataset.sugerencia)));
$('#nueva').addEventListener('click', () => {
  st.ctl?.abort();
  wa.reiniciarConversacion(TEL);
  $('#registro').replaceChildren();
  dibujar(); bandeja.refrescar();
});
$('#reiniciar').addEventListener('click', () => { sb.demo.reiniciar(); location.reload(); });
window.addEventListener('demo-whatsapp', () => { dibujar(); bandeja.refrescar(); });

// ───────────────────────── Asistente ─────────────────────────

function avisar(texto, tipo = 'error') {
  $('#aviso-claude').hidden = !texto;
  $('#aviso-claude').className = `aviso ${tipo}`;
  $('#aviso-claude').textContent = texto ?? '';
}

function anotar(nombre, entrada, salida) {
  const corto = (x) => { const t = typeof x === 'string' ? x : JSON.stringify(x); return t.length > 900 ? `${t.slice(0, 900)}…` : t; };
  $('#registro').prepend(h('details', { class: 'reg' },
    h('summary', {}, h('span', { class: 'reg-hora' }, hora(new Date())), ` Consultó ${ETIQUETA[nombre] ?? nombre}`),
    h('pre', {}, `Pidió: ${corto(entrada)}\n\nRecibió: ${corto(salida)}`)));
}

async function responder() {
  if (st.ocupado) return;
  const c = wa.conversacion(TEL);
  const hist = wa.historial(TEL);
  if (!c || c.estado !== 'bot' || wa.ajuste('bot_activo') === 'false' || hist.at(-1)?.autor !== 'paciente') return;
  if (st.sample === undefined) st.sample = await window.claude?.use?.('sample') ?? null;
  if (!st.sample) return avisar('El asistente responde solo cuando esta página se abre en claude.ai. La bandeja de Nati sí se puede recorrer.');

  st.ocupado = true; dibujar();
  const ctx = { sb, telefono: TEL, derivar: async (motivo, resumen) => wa.derivar(TEL, motivo, resumen) };
  let escrito = '';
  let corte = 0; // lo escrito antes de la última consulta es preparación, no va al paciente
  const tools = HERRAMIENTAS.map((t) => ({
    name: t.name, description: t.description, inputSchema: t.input_schema,
    execute: async (entrada) => {
      corte = escrito.length;
      let salida;
      try { salida = await ejecutarHerramienta(t.name, entrada, ctx); } catch (e) { salida = `Error: ${e.message}`; anotar(t.name, entrada, salida); throw e; }
      anotar(t.name, entrada, salida);
      return salida;
    },
  }));
  const input = [{ role: 'user', content: PREAMBULO + instrucciones(wa.ajuste('bot_info')) },
    ...aTurnos(hist, contextoDelMomento(new Date(), NOMBRE))];
  st.ctl = new AbortController();
  try {
    const { text } = await st.sample(input, {
      tools, modelTier: 'default', effort: 'low', signal: st.ctl.signal,
      onText: ({ text: t }) => { escrito = t; },
    });
    avisar(null);
    const respuesta = text.slice(corte).trim();
    if (respuesta && wa.conversacion(TEL)) wa.guardarSaliente(TEL, 'asistente', respuesta);
  } catch (e) {
    if (e.code === 'cancelled') { /* nueva conversación */ }
    else if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'tools_unavailable'].includes(e.code)) {
      avisar('Para que el asistente responda, esta página necesita usar Claude con tu cuenta. Podés habilitarlo desde los permisos del artifact y volver a escribir.');
    } else if (e.code === 'rate_limited') {
      avisar('Se alcanzó el límite de uso de Claude por ahora. Probá de nuevo en un rato.');
    } else if (e.code === 'refused') {
      // Igual que en producción: si el modelo no puede responder, la conversación pasa a Nati
      wa.derivar(TEL, 'El asistente no pudo responder', 'La consulta necesita a una persona.');
      wa.guardarSaliente(TEL, 'asistente', 'Esa consulta prefiero pasársela a Nati, que te va a responder por acá en cuanto pueda.');
    } else {
      avisar('El asistente no pudo responder (falla de conexión). Volvé a mandar el mensaje.');
    }
  } finally {
    st.ocupado = false;
    dibujar(); bandeja.refrescar();
    // Si el paciente escribió mientras se respondía, se contesta eso también
    if (wa.historial(TEL).at(-1)?.autor === 'paciente' && wa.conversacion(TEL)?.estado === 'bot') st.timer = setTimeout(responder, 600);
  }
}

// ───────────────────────── Vista en el celular ─────────────────────────

document.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-vista]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  document.body.dataset.vista = b.dataset.vista;
  if (b.dataset.vista === 'nati') bandeja.refrescar();
}));

dibujar();

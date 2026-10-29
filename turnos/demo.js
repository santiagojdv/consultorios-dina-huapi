// Modo demostración: una base simulada en el navegador que reemplaza a Supabase mientras
// turnos/config.js está vacío. Reproduce las reglas de supabase/schema.sql (sin superposiciones,
// turnos solo dentro de horarios alquilados, cada profesional ve solo a sus pacientes) para que
// todo el circuito se pueda probar antes de crear la base real. Los datos quedan en este navegador.
export function crearDemo() {
  const CLAVE = 'cdh-demo-v6';
  const minutos = (t) => { const [a, b] = t.split(':').map(Number); return a * 60 + b; };
  const hhmmDe = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const isodow = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay() || 7;
  const fLocal = (d) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(d)).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  };
  const hLocal = (d) => new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d));
  const inst = (f, hh) => new Date(`${f}T${hh}:00-03:00`).toISOString();
  const masDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const masMin = (iso, n) => new Date(new Date(iso).getTime() + n * 60000).toISOString();
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`);
  const pisa = (a1, b1, a2, b2) => a1 < b2 && a2 < b1;
  const error = (message, hint) => Object.assign(new Error(message), { hint });

  function semilla() {
    const hoy = fLocal(new Date());
    const lunes = masDias(hoy, 1 - isodow(hoy));
    const desde = masDias(lunes, -7);
    const [y, m] = hoy.split('-').map(Number);
    const hasta = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
    const pros = [
      { id: 'demo-admin', email: 'administracion@ejemplo.com', nombre: 'Administración', especialidad: '', telefono: '', es_admin: true, publico: false },
      { id: 'demo-nati', email: 'natalia@ejemplo.com', nombre: 'Dra. Natalia Cárdenas', especialidad: 'Ortodoncia y estética facial', telefono: '2944636977', publico: true, atiende_whatsapp: true, bio: 'Directora del consultorio. Ortodoncia, alineadores, ortopedia maxilar y estética facial.', web: 'nati/' },
      { id: 'demo-gomez', email: 'martin.gomez@ejemplo.com', nombre: 'Dr. Martín Gómez (ejemplo)', especialidad: 'Odontología general', telefono: '2944654321', publico: true, duracion_turno: 45, bio: 'Profesional de ejemplo para la demostración.' },
      { id: 'demo-ruiz', email: 'laura.ruiz@ejemplo.com', nombre: 'Dra. Laura Ruiz (ejemplo)', especialidad: 'Endodoncia', telefono: '', publico: true, duracion_turno: 60, bio: 'Profesional de ejemplo para la demostración.' },
    ].map((p) => ({ duracion_turno: 30, anticipacion_horas: 2, ventana_dias: 30, aviso_cancelacion_horas: 24, activo: true, es_admin: false, atiende_whatsapp: false, bio: '', web: '', foto: '', ...p }));
    let n = 0;
    const alq = (pro, box, dia, ini, fin) => ({ id: ++n, profesional_id: pro, consultorio_id: box, dia_semana: dia, hora_inicio: `${ini}:00`, hora_fin: `${fin}:00`, vigente_desde: desde, vigente_hasta: hasta, nota: 'Abonado' });
    const alquileres = [
      alq('demo-nati', 1, 1, '09:00', '13:00'), alq('demo-nati', 1, 3, '09:00', '13:00'), alq('demo-nati', 1, 5, '09:00', '13:00'),
      alq('demo-gomez', 1, 2, '14:00', '19:00'), alq('demo-gomez', 1, 4, '14:00', '19:00'), alq('demo-gomez', 2, 6, '09:00', '12:00'),
      alq('demo-ruiz', 2, 1, '15:00', '20:00'), alq('demo-ruiz', 2, 3, '15:00', '20:00'),
    ];
    const nombres = ['Lucía Fernández', 'Diego Sosa', 'Carla Méndez', 'Julián Torres', 'Paula Benítez', 'Tomás Rivas', 'Sofía Acosta', 'Nicolás Paz'];
    const turnos = [];
    let k = 0;
    for (const semana of [0, 7]) {
      for (const [dia, horas] of [[1, ['09:00', '10:30', '12:00']], [3, ['09:30', '11:00']], [5, ['10:00', '11:30', '12:30']]]) {
        const f = masDias(lunes, semana + dia - 1);
        for (const hh of horas) {
          const ini = inst(f, hh);
          turnos.push({ id: ++k, profesional_id: 'demo-nati', consultorio_id: 1, inicio: ini, fin: masMin(ini, 30), paciente_nombre: nombres[k % nombres.length], paciente_telefono: `29445${String(10000 + k * 137).slice(-5)}`, paciente_email: '', nota: '', origen: k % 3 ? 'online' : 'profesional', estado: 'confirmado', cancelado_por: null, token: uuid(), creado: new Date().toISOString() });
        }
      }
    }
    // Algunos turnos de colegas, para que el calendario muestre ocupación ajena
    for (const semana of [0, 7]) {
      for (const [pro, box, dia, horas, dur] of [['demo-gomez', 1, 2, ['14:00', '15:30', '17:15'], 45], ['demo-gomez', 1, 4, ['14:45', '16:15'], 45], ['demo-ruiz', 2, 1, ['15:00', '17:00'], 60], ['demo-ruiz', 2, 3, ['16:00', '18:00'], 60], ['demo-gomez', 2, 6, ['09:00', '09:45'], 45]]) {
        const f = masDias(lunes, semana + dia - 1);
        for (const hh of horas) {
          const ini = inst(f, hh);
          turnos.push({ id: ++k, profesional_id: pro, consultorio_id: box, inicio: ini, fin: masMin(ini, dur), paciente_nombre: nombres[k % nombres.length], paciente_telefono: `29446${String(10000 + k * 71).slice(-5)}`, paciente_email: '', nota: '', origen: 'online', estado: 'confirmado', cancelado_por: null, token: uuid(), creado: new Date().toISOString() });
        }
      }
    }
    // Catálogo y precios de EJEMPLO (los reales los carga Nati con la planilla)
    const serv = [
      ['Consultas', 'Primera consulta y diagnóstico', 'Revisión completa, diagnóstico y plan de tratamiento.', 40, 30000],
      ['Consultas', 'Control', 'Control periódico o seguimiento.', 20, 20000],
      ['Consultas', 'Urgencia', 'Dolor, golpe o una pieza rota.', 30, 35000],
      ['Prevención', 'Limpieza y fluoración', 'Limpieza profesional y fluoración.', 40, 40000],
      ['Odontología general', 'Arreglo de caries', 'Restauración del color del diente.', 45, 55000],
      ['Odontología general', 'Tratamiento de conducto', 'Endodoncia (puede requerir más de una sesión).', 60, 150000],
      ['Odontología general', 'Extracción', 'Extracción simple.', 40, 50000],
      ['Ortodoncia', 'Consulta de ortodoncia', 'Evaluación de la mordida y opciones de tratamiento.', 40, 35000],
      ['Ortodoncia', 'Control de ortodoncia', 'Para pacientes en tratamiento con brackets o placas.', 20, 30000],
      ['Ortodoncia', 'Alineadores invisibles: evaluación', 'Escaneo y evaluación para alineadores.', 45, 40000],
      ['Estética', 'Blanqueamiento', 'Blanqueamiento en consultorio.', 60, 180000],
      ['Estética', 'Estética facial: consulta', 'Evaluación de tratamientos faciales complementarios.', 30, 30000],
      ['Bruxismo', 'Placa de bruxismo', 'Toma de impresiones para la placa a medida.', 30, 120000],
    ];
    const servicios = serv.map(([categoria, nombre, descripcion, duracion_min], i) => ({ id: i + 1, nombre, categoria, descripcion, duracion_min, reservable_online: true, activo: true, orden: { Consultas: 10, Prevención: 20, 'Odontología general': 30, Ortodoncia: 40, Estética: 50, Bruxismo: 60 }[categoria] ?? 100 }));
    const obras_sociales = ['IPROSS', 'OSDE', 'Swiss Medical', 'Galeno', 'Medifé'].map((nombre, i) => ({ id: i + 1, nombre, activo: true, nota: '' }));
    const base = '2026-08-01';
    const aranceles = [];
    let ka = 0;
    serv.forEach(([cat, , , , precio], i) => {
      aranceles.push({ id: ++ka, servicio_id: i + 1, obra_social_id: null, modalidad: 'particular', monto: precio, valor_os: null, periodo_base: base, ajusta_ipc: true });
      for (const o of obras_sociales) {
        const mod = ['Consultas', 'Prevención'].includes(cat) ? 'cubierto' : ['Odontología general', 'Bruxismo'].includes(cat) ? 'copago' : cat === 'Ortodoncia' ? 'copago' : 'no_cubre';
        const monto = mod === 'copago' ? Math.round(precio * (cat === 'Ortodoncia' ? 0.5 : 0.2) / 1000) * 1000 : 0;
        aranceles.push({ id: ++ka, servicio_id: i + 1, obra_social_id: o.id, modalidad: mod, monto, valor_os: mod === 'no_cubre' ? null : Math.round(precio * 0.6 / 1000) * 1000, periodo_base: base, ajusta_ipc: true });
      }
    });
    const profesional_servicios = [
      ...[1, 2, 3, 4, 8, 9, 10, 11, 12, 13].map((id) => ({ profesional_id: 'demo-nati', servicio_id: id, duracion_min: null })),
      ...[1, 2, 3, 4, 5, 7, 13].map((id) => ({ profesional_id: 'demo-gomez', servicio_id: id, duracion_min: null })),
      ...[1, 3, 6].map((id) => ({ profesional_id: 'demo-ruiz', servicio_id: id, duracion_min: id === 6 ? 90 : null })),
    ];
    const ipc = [{ periodo: '2026-08-01', variacion: 1.9, fuente: 'ejemplo (demo)', cargado: new Date().toISOString() }, { periodo: '2026-09-01', variacion: 2.1, fuente: 'ejemplo (demo)', cargado: new Date().toISOString() }];
    // Fichas de pacientes para los turnos de ejemplo
    const pacientes = [];
    for (const t of turnos) {
      let pac = pacientes.find((x) => `${x.nombre} ${x.apellido}` === t.paciente_nombre);
      if (!pac) {
        const [nombre, apellido] = t.paciente_nombre.split(' ');
        pac = { id: pacientes.length + 1, dni: String(30000000 + pacientes.length * 1234567), nombre, apellido, fecha_nacimiento: null, telefono: t.paciente_telefono, email: '', obra_social_id: (pacientes.length % 3) ? (pacientes.length % 5) + 1 : null, nro_afiliado: '', consentimiento: new Date().toISOString(), creado: new Date().toISOString(), actualizado: new Date().toISOString() };
        pacientes.push(pac);
      }
      const delPro = profesional_servicios.filter((x) => x.profesional_id === t.profesional_id).map((x) => x.servicio_id);
      Object.assign(t, { paciente_id: pac.id, servicio_id: delPro[t.id % delPro.length], detalle: '', obra_social_id: pac.obra_social_id, modalidad: null, monto_estimado: null, datos_distintos: false });
    }
    const ajustes = [{ id: 901, clave: 'redondeo', valor: '100' }, { id: 902, clave: 'ipc_serie', valor: '148.3_INIVELNAL_DICI_M_26' },
      { id: 903, clave: 'bot_activo', valor: 'true' }, { id: 904, clave: 'bot_retoma_horas', valor: '24' },
      { id: 905, clave: 'bot_info', valor: ['Consultorios Dina Huapi. Odontología general, ortodoncia y estética facial. Fundadora: Dra. Natalia Cárdenas.',
        'Dirección: Estados Unidos 860, Oficina D, Dina Huapi (Río Negro).',
        'Horarios de atención: lunes a viernes de 9 a 19 h y sábados de 10 a 14 h.',
        'Medios de pago (ejemplo): efectivo, transferencia y tarjetas de débito y crédito.',
        'Obras sociales: las que figuran en la lista de precios. Si una no figura, se atiende como particular.',
        'Primera visita: llegar 10 minutos antes, traer DNI y credencial de la obra social.',
        'Cancelaciones: se cancelan con el link que llega al reservar o pidiéndolo por acá, con 24 h de anticipación.',
        'Urgencias: si hay dolor fuerte, golpe o una pieza rota, ofrecer el primer turno disponible de "Urgencia". Si hay sangrado que no para, fiebre o hinchazón de cara, indicar guardia médica.',
        'Niños: primera visita cerca del año; evaluación de ortopedia a los 6 o 7 años.'].join('\n') }];
    // Conversaciones de WhatsApp de ejemplo: una que resolvió el asistente y una derivada a Nati
    const hace = (min) => new Date(Date.now() - min * 60000).toISOString();
    const wa_conversaciones = [
      { telefono: '5492944512345', nombre: 'Marta (ejemplo)', estado: 'humano', motivo_derivacion: 'Pregunta clínica', derivada_en: hace(40), atendida_por: null, ultimo_entrante: hace(41), ultimo_mensaje: hace(40), no_leidos: 1, creado: hace(45) },
      { telefono: '5492944598765', nombre: 'Julián (ejemplo)', estado: 'bot', motivo_derivacion: '', derivada_en: null, atendida_por: null, ultimo_entrante: hace(180), ultimo_mensaje: hace(179), no_leidos: 0, creado: hace(185) },
    ];
    let km = 0;
    const msj = (telefono, autor, texto, min) => ({ id: ++km, telefono, direccion: autor === 'paciente' ? 'entrante' : 'saliente', autor, autor_id: null, texto, wa_id: null, creado: hace(min) });
    const wa_mensajes = [
      msj('5492944598765', 'paciente', 'Hola, ¿atienden por IPROSS?', 185),
      msj('5492944598765', 'asistente', '¡Hola Julián! Soy el asistente virtual de Consultorios Dina Huapi; si en algún momento querés hablar con Nati, decime.\nSí, trabajamos con IPROSS. ¿Qué necesitás: un control, una limpieza u otra consulta?', 184),
      msj('5492944598765', 'paciente', 'Un control nomás, después veo. Gracias!', 180),
      msj('5492944598765', 'asistente', 'De nada. Cuando quieras te paso horarios por acá.', 179),
      msj('5492944512345', 'paciente', 'Hola, a mi hija de 8 le están saliendo los dientes de adelante torcidos, ¿hay que ponerle aparatos ya?', 45),
      msj('5492944512345', 'asistente', 'Hola Marta, soy el asistente virtual del consultorio. Eso lo tiene que evaluar Nati, así que le paso tu consulta: te va a responder por acá en cuanto pueda.', 44),
      msj('5492944512345', 'sistema', 'Derivada a Nati: Pregunta clínica\nMadre consulta por hija de 8 años con incisivos que salen torcidos; pregunta si necesita ortodoncia ya. No se dio turno todavía.', 44),
      msj('5492944512345', 'paciente', 'Dale, gracias', 41),
    ];
    profesional_servicios.forEach((x, i) => { x.id = 500 + i; });
    ipc.forEach((x, i) => { x.id = 950 + i; });
    return { consultorios: [{ id: 1, nombre: 'Box 1', activo: true }, { id: 2, nombre: 'Box 2', activo: true }], profesionales: pros, alquileres, ausencias: [], turnos, calendario_tokens: [], servicios, obras_sociales, aranceles, profesional_servicios, ipc, pacientes, ajustes, wa_conversaciones, wa_mensajes, seq: 1000 };
  }

  let db;
  try { db = JSON.parse(localStorage.getItem(CLAVE)); } catch { db = null; }
  if (!db?.profesionales || !db.aranceles || !db.wa_conversaciones) db = semilla();
  let sesion = null;
  try { sesion = JSON.parse(localStorage.getItem(`${CLAVE}-sesion`)); } catch { sesion = null; }
  const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(db)); localStorage.setItem(`${CLAVE}-sesion`, JSON.stringify(sesion)); } catch { /* sin almacenamiento: la demo sigue en memoria */ } };
  let avisarAuth = () => {};

  const uid = () => sesion?.user?.id ?? null;
  const yo = () => db.profesionales.find((p) => p.id === uid());
  const soyActivo = () => Boolean(yo()?.activo);
  const soyAdmin = () => Boolean(yo()?.activo && yo()?.es_admin);
  const soyWhatsapp = () => Boolean(yo()?.activo && yo()?.atiende_whatsapp);
  const confirmado = (t) => t.estado === 'confirmado';

  // ── Precios (mismas cuentas que factor_ipc / monto_vigente / cotizar en SQL) ──
  const factorIpc = (base) => db.ipc.filter((x) => x.periodo >= base).reduce((f, x) => f * (1 + x.variacion / 100), 1);
  const montoVigente = (monto, base, ajusta) => {
    if (monto == null || !monto || !ajusta) return monto;
    const r = Math.max(Number(db.ajustes.find((x) => x.clave === 'redondeo')?.valor) || 1, 1);
    return Math.round((monto * factorIpc(base)) / r) * r;
  };
  function cotizar(sid, osid) {
    const part = db.aranceles.find((a) => a.servicio_id === sid && a.obra_social_id == null);
    const os = osid ? db.aranceles.find((a) => a.servicio_id === sid && a.obra_social_id === osid) : null;
    if (os && ['cubierto', 'copago'].includes(os.modalidad)) return { modalidad: os.modalidad, monto: montoVigente(os.monto, os.periodo_base, os.ajusta_ipc) };
    return { modalidad: osid ? 'no_cubre' : 'particular', monto: part ? montoVigente(part.monto, part.periodo_base, part.ajusta_ipc) : null };
  }
  function duracionDe(pid, sid) {
    const ps = db.profesional_servicios.find((x) => x.profesional_id === pid && x.servicio_id === sid);
    const s = db.servicios.find((x) => x.id === sid && x.activo);
    if (ps && s) return ps.duracion_min || s.duracion_min;
    return db.profesionales.find((x) => x.id === pid).duracion_turno;
  }
  const aVigentes = () => db.aranceles.map((a) => {
    const s = db.servicios.find((x) => x.id === a.servicio_id);
    return { ...a, servicio: s?.nombre, categoria: s?.categoria, obra_social: db.obras_sociales.find((o) => o.id === a.obra_social_id)?.nombre ?? 'Particular',
      monto_hoy: montoVigente(a.monto, a.periodo_base, a.ajusta_ipc), valor_os_hoy: a.valor_os == null ? null : montoVigente(a.valor_os, a.periodo_base, a.ajusta_ipc) };
  });

  function libres(pid, desde, hasta, sid = null) {
    const p = db.profesionales.find((x) => x.id === pid && x.activo);
    const propio = uid() === pid;
    if (!p || !(p.publico || propio)) return [];
    const hoy = fLocal(new Date());
    const paso = p.duracion_turno;
    const dur = duracionDe(pid, sid);
    const desdeOk = propio ? new Date().toISOString() : masMin(new Date().toISOString(), p.anticipacion_horas * 60);
    const tope = propio ? hasta : [hasta, masDias(hoy, p.ventana_dias)].sort()[0];
    const out = [];
    for (let f = desde < hoy ? hoy : desde; f <= tope; f = masDias(f, 1)) {
      for (const a of db.alquileres) {
        if (a.profesional_id !== pid || a.dia_semana !== isodow(f) || f < a.vigente_desde || f > a.vigente_hasta) continue;
        for (let m = minutos(a.hora_inicio); m + dur <= minutos(a.hora_fin); m += paso) {
          const ini = inst(f, hhmmDe(m)), fin = masMin(ini, dur);
          if (ini < desdeOk) continue;
          if (db.turnos.some((t) => t.profesional_id === pid && confirmado(t) && pisa(t.inicio, t.fin, ini, fin))) continue;
          if (db.ausencias.some((x) => x.profesional_id === pid && pisa(x.desde, x.hasta, ini, fin))) continue;
          out.push({ inicio: ini, fin: propio ? fin : null });
        }
      }
    }
    return out.sort((a, b) => a.inicio.localeCompare(b.inicio));
  }

  function validarTurno(t) {
    const f = fLocal(t.inicio);
    if (fLocal(t.fin) !== f && hLocal(t.fin) !== '00:00') throw error('El horario está fuera de las franjas alquiladas por el profesional');
    const ini = minutos(hLocal(t.inicio)), fin = minutos(hLocal(t.fin));
    const a = db.alquileres.find((x) => x.profesional_id === t.profesional_id && x.dia_semana === isodow(f)
      && f >= x.vigente_desde && f <= x.vigente_hasta && ini >= minutos(x.hora_inicio) && fin <= minutos(x.hora_fin));
    if (!a) throw error('El horario está fuera de las franjas alquiladas por el profesional', 'fuera_de_alquiler');
    t.consultorio_id = a.consultorio_id;
    if (db.turnos.some((x) => x.id !== t.id && confirmado(x) && x.profesional_id === t.profesional_id && pisa(x.inicio, x.fin, t.inicio, t.fin))) throw error('turno_superpuesto_profesional');
    if (db.turnos.some((x) => x.id !== t.id && confirmado(x) && x.consultorio_id === t.consultorio_id && pisa(x.inicio, x.fin, t.inicio, t.fin))) throw error('turno_superpuesto_consultorio');
  }

  function validarAlquiler(a) {
    if (a.hora_fin <= a.hora_inicio || a.vigente_hasta < a.vigente_desde) throw error('Revisá horas y fechas');
    for (const x of db.alquileres) {
      if (x.id === a.id || x.dia_semana !== a.dia_semana) continue;
      if (!(x.vigente_desde <= a.vigente_hasta && a.vigente_desde <= x.vigente_hasta)) continue;
      if (!pisa(minutos(x.hora_inicio), minutos(x.hora_fin), minutos(a.hora_inicio), minutos(a.hora_fin))) continue;
      if (x.consultorio_id === a.consultorio_id) throw error('alquiler_superpuesto_consultorio');
      if (x.profesional_id === a.profesional_id) throw error('alquiler_superpuesto_profesional');
    }
  }

  // Mismo efecto que el trigger proteger_conversacion de 03_whatsapp.sql
  const conversacionNueva = (antes, nuevo) => (nuevo.estado === 'bot'
    ? { motivo_derivacion: '', derivada_en: null, atendida_por: nuevo.atendida_por ?? null }
    : antes.estado === 'bot' ? { derivada_en: nuevo.derivada_en ?? new Date().toISOString() } : {});

  // ── WhatsApp: lo que en producción hace la función supabase/functions/whatsapp con la clave de servicio ──
  const wa = {
    registrar(telefono, nombre, texto) {
      const ahora = new Date().toISOString();
      let c = db.wa_conversaciones.find((x) => x.telefono === telefono);
      if (!c) {
        c = { telefono, nombre, estado: 'bot', motivo_derivacion: '', derivada_en: null, atendida_por: null, ultimo_entrante: null, ultimo_mensaje: ahora, no_leidos: 0, creado: ahora };
        db.wa_conversaciones.push(c);
      }
      const m = { id: ++db.seq, telefono, direccion: 'entrante', autor: 'paciente', autor_id: null, texto: texto.slice(0, 4096), wa_id: null, creado: ahora };
      db.wa_mensajes.push(m);
      Object.assign(c, { nombre: nombre || c.nombre, ultimo_entrante: ahora, ultimo_mensaje: ahora, no_leidos: Math.min(c.no_leidos + 1, 999) });
      guardar();
      return { id: m.id, estado: c.estado, bot_activo: db.ajustes.find((x) => x.clave === 'bot_activo')?.valor !== 'false' };
    },
    guardarSaliente(telefono, autor, texto, autorId = null) {
      db.wa_mensajes.push({ id: ++db.seq, telefono, direccion: 'saliente', autor, autor_id: autorId, texto: texto.slice(0, 4096), wa_id: null, creado: new Date().toISOString() });
      db.wa_conversaciones.find((x) => x.telefono === telefono).ultimo_mensaje = new Date().toISOString();
      guardar();
      window.dispatchEvent(new CustomEvent('demo-whatsapp', { detail: { telefono } }));
    },
    derivar(telefono, motivo, resumen) {
      const c = db.wa_conversaciones.find((x) => x.telefono === telefono);
      Object.assign(c, { estado: 'humano', motivo_derivacion: motivo, derivada_en: new Date().toISOString() });
      db.wa_mensajes.push({ id: ++db.seq, telefono, direccion: 'saliente', autor: 'sistema', autor_id: null, texto: `Derivada a Nati: ${motivo}\n${resumen}`.slice(0, 4096), wa_id: null, creado: new Date().toISOString() });
      guardar();
      window.dispatchEvent(new CustomEvent('demo-whatsapp', { detail: { telefono, derivada: true } }));
    },
    historial: (telefono) => db.wa_mensajes.filter((m) => m.telefono === telefono).sort((a, b) => a.id - b.id).map(({ autor, texto, creado }) => ({ autor, texto, creado })),
    reiniciarConversacion(telefono) {
      db.wa_conversaciones = db.wa_conversaciones.filter((x) => x.telefono !== telefono);
      db.wa_mensajes = db.wa_mensajes.filter((x) => x.telefono !== telefono);
      guardar();
    },
    conversacion: (telefono) => db.wa_conversaciones.find((x) => x.telefono === telefono) ?? null,
    ajuste: (clave) => db.ajustes.find((x) => x.clave === clave)?.valor ?? '',
  };

  const visibles = (tabla) => {
    const filas = db[tabla] ?? [];
    if (tabla === 'calendario_tokens') return soyActivo() ? filas.filter((r) => r.profesional_id === uid()) : [];
    if (tabla === 'turnos' || tabla === 'ausencias') return soyActivo() ? filas.filter((r) => r.profesional_id === uid()) : [];
    if (tabla === 'profesionales') return filas.filter((r) => soyActivo() || r.id === uid());
    if (tabla === 'pacientes') return soyActivo() ? filas.filter((r) => db.turnos.some((t) => t.paciente_id === r.id && t.profesional_id === uid())) : [];
    if (tabla === 'aranceles_vigentes') return soyActivo() ? aVigentes() : [];
    if (tabla === 'wa_conversaciones' || tabla === 'wa_mensajes') return soyWhatsapp() ? filas : [];
    return soyActivo() ? filas : [];
  };

  const SOLO_ADMIN = ['consultorios', 'alquileres', 'servicios', 'obras_sociales', 'aranceles', 'ipc', 'ajustes'];

  class Consulta {
    constructor(tabla) { Object.assign(this, { tabla, op: 'select', filtros: [], orden: [], uno: null, cols: '*', conteo: false, cabeza: false, devolver: false }); }
    select(cols = '*', opts = {}) { if (this.op === 'select') { this.cols = cols; this.conteo = Boolean(opts.count); this.cabeza = Boolean(opts.head); } else this.devolver = true; return this; }
    eq(c, v) { this.filtros.push((r) => String(r[c]) === String(v)); return this; }
    gte(c, v) { this.filtros.push((r) => r[c] >= v); return this; }
    lt(c, v) { this.filtros.push((r) => r[c] < v); return this; }
    order(c) { this.orden.push(c); return this; }
    maybeSingle() { this.uno = 'quizas'; return this; }
    single() { this.uno = 'uno'; return this; }
    insert(fila) { this.op = 'insert'; this.fila = fila; return this; }
    update(cambios) { this.op = 'update'; this.cambios = cambios; return this; }
    delete() { this.op = 'delete'; return this; }
    then(ok, mal) { return new Promise((r) => setTimeout(r, 120)).then(() => this.ejecutar()).then(ok, mal); }
    filas() {
      let r = visibles(this.tabla).filter((x) => this.filtros.every((f) => f(x)));
      for (const c of [...this.orden].reverse()) r = [...r].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0));
      return r;
    }
    ejecutar() {
      try {
        const res = this[`_${this.op}`]();
        guardar();
        return res;
      } catch (e) { return { data: null, error: { message: e.message, hint: e.hint }, count: null }; }
    }
    _select() { return this.forma(this.filas().map((r) => this.embebido({ ...r }))); }
    embebido(r) {
      if (this.cols.includes('consultorios(')) r.consultorios = { nombre: db.consultorios.find((c) => c.id === r.consultorio_id)?.nombre };
      if (this.cols.includes('servicios(')) r.servicios = db.servicios.find((c) => c.id === r.servicio_id) ?? null;
      if (this.cols.includes('obras_sociales(')) r.obras_sociales = db.obras_sociales.find((c) => c.id === r.obra_social_id) ?? null;
      if (this.cols.includes('pacientes(')) r.pacientes = db.pacientes.find((c) => c.id === r.paciente_id) ?? null;
      return r;
    }
    forma(filas) {
      if (this.cabeza) return { data: null, error: null, count: filas.length };
      if (this.uno === 'quizas') return { data: filas[0] ?? null, error: null };
      if (this.uno === 'uno') return filas.length === 1 ? { data: filas[0], error: null } : { data: null, error: { message: 'No se encontró el registro' } };
      return { data: filas, error: null, count: this.conteo ? filas.length : null };
    }
    puedoEscribir() {
      if (['wa_conversaciones', 'wa_mensajes'].includes(this.tabla)) throw error('permiso denegado');
      if (SOLO_ADMIN.includes(this.tabla) && !soyAdmin()) throw error('permiso denegado');
      if (!soyActivo()) throw error('permiso denegado');
      if (this.tabla === 'profesional_servicios' && !soyAdmin() && [this.fila, ...this.filas()].some((r) => r && r.profesional_id && r.profesional_id !== uid())) throw error('permiso denegado');
    }
    _insert() {
      if (Array.isArray(this.fila)) {
        // Varias filas: todas o ninguna, como un insert en Postgres
        const copia = JSON.stringify(db);
        try {
          for (const f of this.fila) Object.assign(new Consulta(this.tabla), { op: 'insert', fila: f })._insert();
        } catch (e) { db = JSON.parse(copia); throw e; }
        return { data: null, error: null };
      }
      this.puedoEscribir();
      const t = this.tabla;
      const fila = { id: ++db.seq, ...this.fila };
      if (t === 'turnos') {
        if (fila.profesional_id !== uid()) throw error('permiso denegado');
        Object.assign(fila, { paciente_email: '', nota: '', ...fila, origen: 'profesional', estado: 'confirmado', cancelado_por: null, token: uuid(), creado: new Date().toISOString() });
        validarTurno(fila);
      }
      if (t === 'ausencias' && fila.profesional_id !== uid()) throw error('permiso denegado');
      if (t === 'profesional_servicios') {
        fila.profesional_id ??= uid();
        if (db.profesional_servicios.some((x) => x.profesional_id === fila.profesional_id && x.servicio_id === fila.servicio_id)) throw error('duplicate key value violates unique constraint');
      }
      if (t === 'pacientes') {
        if (db.pacientes.some((x) => x.dni === fila.dni)) throw error('Ya existe un paciente con ese DNI');
        Object.assign(fila, { email: '', obra_social_id: null, nro_afiliado: '', fecha_nacimiento: null, ...fila, creado: new Date().toISOString(), actualizado: new Date().toISOString() });
      }
      if (['servicios', 'obras_sociales'].includes(t) && db[t].some((c) => c.nombre.toLowerCase() === String(fila.nombre).toLowerCase())) throw error('duplicate key value violates unique constraint');
      if (t === 'servicios') Object.assign(fila, { categoria: 'Consultas', descripcion: '', duracion_min: 30, reservable_online: true, activo: true, orden: 100, ...fila });
      if (t === 'obras_sociales') Object.assign(fila, { activo: true, nota: '', ...fila });
      if (t === 'calendario_tokens') {
        if (fila.profesional_id !== uid() || db.calendario_tokens.some((x) => x.profesional_id === uid())) throw error('permiso denegado');
        fila.token = uuid();
      }
      if (t === 'alquileres') validarAlquiler(fila);
      if (t === 'consultorios') {
        if (db.consultorios.some((c) => c.nombre.toLowerCase() === fila.nombre.toLowerCase())) throw error('duplicate key value violates unique constraint');
        fila.activo = true;
      }
      db[t].push(fila);
      return { data: null, error: null };
    }
    _update() {
      const t = this.tabla;
      if (SOLO_ADMIN.includes(t) && !soyAdmin()) return { data: [], error: null };
      if (t === 'wa_mensajes') throw error('permiso denegado');
      if (t === 'wa_conversaciones' && Object.keys(this.cambios).some((c) => ['telefono', 'nombre', 'ultimo_entrante'].includes(c))) throw error('Ese dato no se edita desde el panel');
      if (t === 'profesional_servicios' && !soyAdmin()) this.filtros.push((r) => r.profesional_id === uid());
      const filas = this.filas().filter((r) => t !== 'profesionales' || r.id === uid() || soyAdmin());
      if (t === 'profesionales' && !soyAdmin() && ['es_admin', 'activo', 'email', 'atiende_whatsapp'].some((c) => c in this.cambios)) throw error('Solo un administrador puede cambiar esos datos');
      if (t === 'profesionales' && this.cambios.es_admin === false && filas.some((r) => r.id === uid())) throw error('No podés quitarte el rol de administrador a vos mismo');
      const actualizadas = filas.map((r) => {
        const nuevo = { ...r, ...this.cambios };
        if (t === 'alquileres') validarAlquiler(nuevo);
        if (t === 'turnos' && confirmado(nuevo) && (nuevo.inicio !== r.inicio || nuevo.fin !== r.fin)) validarTurno(nuevo);
        if (t === 'consultorios' && db.consultorios.some((c) => c.id !== r.id && c.nombre.toLowerCase() === String(nuevo.nombre).toLowerCase())) throw error('duplicate key value violates unique constraint');
        if (t === 'wa_conversaciones') Object.assign(nuevo, conversacionNueva(r, nuevo));
        return nuevo;
      });
      const clave = t === 'wa_conversaciones' ? 'telefono' : 'id';
      for (const n of actualizadas) Object.assign(db[t].find((r) => r[clave] === n[clave]), n);
      return this.devolver ? this.forma(actualizadas) : { data: null, error: null };
    }
    _delete() {
      this.puedoEscribir();
      if (['turnos', 'pacientes'].includes(this.tabla)) throw error('permiso denegado');
      const ids = new Set(this.filas().map((r) => r.id));
      db[this.tabla] = db[this.tabla].filter((r) => !ids.has(r.id));
      return { data: null, error: null };
    }
  }

  const funciones = {
    profesionales_publicos: () => db.profesionales
      .filter((p) => p.publico && p.activo && p.nombre && db.alquileres.some((a) => a.profesional_id === p.id && a.vigente_hasta >= fLocal(new Date())))
      .map(({ id, nombre, especialidad, duracion_turno, bio, web, foto }) => ({ id, nombre, especialidad, duracion_turno, bio, web, foto }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    turnos_disponibles: ({ p_profesional, p_desde, p_hasta, p_servicio = null }) => libres(p_profesional, p_desde, p_hasta, p_servicio),
    catalogo_publico: ({ p_profesional }) => ({
      servicios: db.servicios.filter((s) => s.activo && s.reservable_online && db.profesional_servicios.some((x) => x.profesional_id === p_profesional && x.servicio_id === s.id))
        .sort((a, b) => a.orden - b.orden || a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre))
        .map(({ id, nombre, categoria, descripcion }) => ({ id, nombre, categoria, descripcion })),
      obras_sociales: db.obras_sociales.filter((o) => o.activo).map(({ id, nombre }) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    }),
    cotizar: ({ p_servicio, p_obra_social = null }) => cotizar(p_servicio, p_obra_social),
    cargar_ipc: ({ p_periodo, p_variacion, p_fuente = 'manual' }) => {
      if (!soyAdmin()) throw error('Solo para administradores');
      const periodo = `${p_periodo.slice(0, 7)}-01`;
      const v = Number(p_variacion);
      if (!Number.isFinite(v) || v < -50 || v > 100) throw error('Variación fuera de rango');
      db.ipc = [...db.ipc.filter((x) => x.periodo !== periodo), { id: ++db.seq, periodo, variacion: v, fuente: p_fuente, cargado: new Date().toISOString() }].sort((a, b) => a.periodo.localeCompare(b.periodo));
      return null;
    },
    importar_aranceles: ({ p_filas }) => {
      if (!soyAdmin()) throw error('Solo para administradores');
      const copia = JSON.stringify(db);
      try {
        for (const f of p_filas) {
          const nombre = String(f.servicio || '').trim();
          if (nombre.length < 2) throw error('Falta el nombre del servicio en una fila');
          let s = db.servicios.find((x) => x.nombre.toLowerCase() === nombre.toLowerCase());
          if (!s) { s = { id: ++db.seq, nombre, categoria: 'Consultas', descripcion: '', duracion_min: 30, reservable_online: true, activo: true, orden: 100 }; db.servicios.push(s); }
          if (f.categoria) s.categoria = f.categoria;
          if (f.descripcion != null && f.descripcion !== '') s.descripcion = f.descripcion;
          if (f.duracion_min) s.duracion_min = Number(f.duracion_min);
          if (f.reservable_online !== '' && f.reservable_online != null) s.reservable_online = f.reservable_online === true || f.reservable_online === 'true';
          let oid = null;
          const on = String(f.obra_social || '').trim();
          if (on && on.toLowerCase() !== 'particular') {
            let o = db.obras_sociales.find((x) => x.nombre.toLowerCase() === on.toLowerCase());
            if (!o) { o = { id: ++db.seq, nombre: on, activo: true, nota: '' }; db.obras_sociales.push(o); }
            oid = o.id;
          }
          if (f.modalidad) {
            if (!['particular', 'cubierto', 'copago', 'no_cubre'].includes(f.modalidad)) throw error(`Modalidad no válida: ${f.modalidad}`);
            if ((oid == null) !== (f.modalidad === 'particular')) throw error(`"${nombre}": particular va sin obra social, y con obra social no puede ser "particular"`);
            const fila = { servicio_id: s.id, obra_social_id: oid, modalidad: f.modalidad, monto: ['particular', 'copago'].includes(f.modalidad) ? Number(f.monto || 0) : 0, valor_os: f.valor_os === '' || f.valor_os == null ? null : Number(f.valor_os), periodo_base: f.periodo_base ? `${String(f.periodo_base).slice(0, 7)}-01` : `${fLocal(new Date()).slice(0, 7)}-01`, ajusta_ipc: f.ajusta_ipc === '' || f.ajusta_ipc == null ? true : f.ajusta_ipc === true || f.ajusta_ipc === 'true' };
            const ya = db.aranceles.find((a) => a.servicio_id === s.id && a.obra_social_id === oid);
            if (ya) Object.assign(ya, fila); else db.aranceles.push({ id: ++db.seq, ...fila });
          }
        }
      } catch (e) { db = JSON.parse(copia); throw e; }
      return { filas: p_filas.length };
    },
    rebasar_aranceles: () => {
      if (!soyAdmin()) throw error('Solo para administradores');
      const ult = db.ipc.map((x) => x.periodo).sort().pop() ?? `${fLocal(new Date()).slice(0, 7)}-01`;
      const [y, m] = ult.split('-').map(Number);
      const base = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
      let n = 0;
      for (const a of db.aranceles) {
        if (!a.ajusta_ipc || a.periodo_base >= base) continue;
        a.monto = montoVigente(a.monto, a.periodo_base, true);
        if (a.valor_os != null) a.valor_os = montoVigente(a.valor_os, a.periodo_base, true);
        a.periodo_base = base; n++;
      }
      return n;
    },
    reservar_turno: ({ p_profesional, p_inicio, p_paciente, p_servicio = null, p_obra_social = null, p_detalle = '' }) => {
      const p = db.profesionales.find((x) => x.id === p_profesional && x.activo && x.publico);
      if (!p) throw error('Profesional no disponible');
      if (p_servicio != null && !funciones.catalogo_publico({ p_profesional: p.id }).servicios.some((s) => s.id === p_servicio)) throw error('Ese servicio no se reserva online con este profesional');
      if (p_servicio == null && (p_detalle || '').trim().length < 3) throw error('Contanos brevemente el motivo de la consulta');
      const f = fLocal(p_inicio);
      if (!libres(p.id, f, f, p_servicio).some((s) => s.inicio === p_inicio)) throw error('Ese horario ya no está disponible', 'ocupado');
      const x = p_paciente || {};
      const dni = String(x.dni || '').replace(/\D/g, '');
      if (!/^\d{7,9}$/.test(dni)) throw error('Revisá el DNI');
      const norm = (t) => (t || '').replace(/\D/g, '').slice(-10);
      const futuros = db.turnos.filter((t) => confirmado(t) && t.inicio > new Date().toISOString() && norm(t.paciente_telefono) === norm(x.telefono));
      if (futuros.filter((t) => t.profesional_id === p.id).length >= 2 || futuros.length >= 4) throw error('Ya tenés varios turnos reservados con ese teléfono. Para más, comunicate con el profesional.', 'limite');
      let pac = db.pacientes.find((y) => y.dni === dni);
      let distinto = false;
      const ahora = new Date().toISOString();
      if (!pac) {
        pac = { id: ++db.seq, dni, nombre: x.nombre.trim(), apellido: x.apellido.trim(), fecha_nacimiento: x.fecha_nacimiento || null, telefono: x.telefono.trim(), email: (x.email || '').trim().toLowerCase(), obra_social_id: p_obra_social, nro_afiliado: (x.nro_afiliado || '').trim(), consentimiento: ahora, creado: ahora, actualizado: ahora };
        db.pacientes.push(pac);
      } else if (norm(pac.telefono) === norm(x.telefono)) {
        Object.assign(pac, { email: (x.email || '').trim().toLowerCase() || pac.email, obra_social_id: p_obra_social, nro_afiliado: (x.nro_afiliado || '').trim() || pac.nro_afiliado, fecha_nacimiento: pac.fecha_nacimiento || x.fecha_nacimiento || null, consentimiento: ahora, actualizado: ahora });
      } else { distinto = true; pac = null; }
      const cot = p_servicio == null ? { modalidad: null, monto: null } : cotizar(p_servicio, p_obra_social);
      const t = { id: ++db.seq, profesional_id: p.id, inicio: p_inicio, fin: masMin(p_inicio, duracionDe(p.id, p_servicio)), paciente_nombre: `${x.nombre.trim()} ${x.apellido.trim()}`, paciente_telefono: x.telefono.trim(), paciente_email: (x.email || '').trim().toLowerCase(), nota: '', origen: 'online', estado: 'confirmado', cancelado_por: null, token: uuid(), creado: ahora,
        paciente_id: pac?.id ?? null, servicio_id: p_servicio, detalle: (p_detalle || '').trim().slice(0, 500), obra_social_id: p_obra_social, modalidad: cot.modalidad, monto_estimado: cot.monto, datos_distintos: distinto };
      validarTurno(t);
      db.turnos.push(t);
      return { token: t.token, inicio: t.inicio, profesional: p.nombre, especialidad: p.especialidad, consultorio: db.consultorios.find((c) => c.id === t.consultorio_id)?.nombre, servicio: db.servicios.find((s) => s.id === t.servicio_id)?.nombre ?? null, modalidad: t.modalidad, monto: t.monto_estimado };
    },
    turno_por_token: ({ p_token }) => {
      const t = db.turnos.find((x) => x.token === p_token);
      if (!t) return null;
      const p = db.profesionales.find((x) => x.id === t.profesional_id);
      return { inicio: t.inicio, estado: t.estado, paciente: t.paciente_nombre, servicio: db.servicios.find((s) => s.id === t.servicio_id)?.nombre ?? null, modalidad: t.modalidad ?? null, monto: t.monto_estimado ?? null, profesional: p.nombre, especialidad: p.especialidad, telefono_profesional: p.telefono, consultorio: db.consultorios.find((c) => c.id === t.consultorio_id)?.nombre, cancelable: confirmado(t) && t.inicio > masMin(new Date().toISOString(), p.aviso_cancelacion_horas * 60), aviso_cancelacion_horas: p.aviso_cancelacion_horas };
    },
    cancelar_turno: ({ p_token }) => {
      const r = funciones.turno_por_token({ p_token });
      if (!r?.cancelable) throw error('El turno no se puede cancelar online (ya pasó el plazo o ya estaba cancelado)');
      Object.assign(db.turnos.find((x) => x.token === p_token), { estado: 'cancelado', cancelado_por: 'paciente' });
      return funciones.turno_por_token({ p_token });
    },
    ocupacion: ({ p_desde, p_hasta }) => {
      if (!soyActivo()) throw error('Solo para profesionales habilitados');
      const nombrePro = (id) => { const p = db.profesionales.find((x) => x.id === id); return p.nombre || p.email; };
      const nombreBox = (id) => db.consultorios.find((c) => c.id === id)?.nombre;
      const out = [];
      for (let f = p_desde; f <= p_hasta; f = masDias(f, 1)) {
        for (const a of db.alquileres.filter((x) => x.dia_semana === isodow(f) && f >= x.vigente_desde && f <= x.vigente_hasta)) {
          out.push({ tipo: 'alquiler', consultorio_id: a.consultorio_id, consultorio: nombreBox(a.consultorio_id), profesional_id: a.profesional_id, profesional: nombrePro(a.profesional_id), inicio: inst(f, a.hora_inicio.slice(0, 5)), fin: inst(f, a.hora_fin.slice(0, 5)), propio: a.profesional_id === uid(), paciente: null, turno_id: null });
        }
      }
      const desde = inst(p_desde, '00:00'), hasta = inst(masDias(p_hasta, 1), '00:00');
      for (const t of db.turnos.filter((x) => confirmado(x) && x.inicio >= desde && x.inicio < hasta)) {
        const propio = t.profesional_id === uid();
        out.push({ tipo: 'turno', consultorio_id: t.consultorio_id, consultorio: nombreBox(t.consultorio_id), profesional_id: t.profesional_id, profesional: nombrePro(t.profesional_id), inicio: t.inicio, fin: t.fin, propio, paciente: propio ? t.paciente_nombre : null, turno_id: propio ? t.id : null });
      }
      return out;
    },
    // Funciones del asistente de WhatsApp (en producción solo las llama la función con clave de servicio)
    wa_turnos: ({ p_telefono }) => {
      const norm = (t) => (t || '').replace(/\D/g, '').slice(-10);
      return db.turnos.filter((t) => confirmado(t) && t.inicio > new Date().toISOString() && norm(t.paciente_telefono) === norm(p_telefono))
        .sort((a, b) => a.inicio.localeCompare(b.inicio))
        .map((t) => {
          const p = db.profesionales.find((x) => x.id === t.profesional_id);
          return { id: t.id, inicio: t.inicio, profesional: p.nombre, servicio: db.servicios.find((s) => s.id === t.servicio_id)?.nombre ?? null, consultorio: db.consultorios.find((c) => c.id === t.consultorio_id)?.nombre, cancelable: t.inicio > masMin(new Date().toISOString(), p.aviso_cancelacion_horas * 60), aviso_cancelacion_horas: p.aviso_cancelacion_horas };
        });
    },
    wa_cancelar_turno: ({ p_telefono, p_turno }) => {
      const norm = (t) => (t || '').replace(/\D/g, '').slice(-10);
      const t = db.turnos.find((x) => x.id === Number(p_turno) && confirmado(x) && norm(x.paciente_telefono) === norm(p_telefono));
      if (!t) throw error('No encontré ese turno a nombre de este número');
      return funciones.cancelar_turno({ p_token: t.token });
    },
    wa_reservar_turno: ({ p_telefono, p_paciente, ...resto }) => {
      const r = funciones.reservar_turno({ ...resto, p_paciente: { ...(p_paciente || {}), telefono: p_telefono } });
      db.turnos.find((x) => x.token === r.token).origen = 'whatsapp';
      const { token, ...sinToken } = r;
      return sinToken;
    },
    turnos_en_alquiler: ({ p_alquiler, p_desde }) => {
      if (!soyAdmin()) throw error('Solo para administradores');
      const a = db.alquileres.find((x) => x.id === p_alquiler);
      const desde = p_desde && p_desde > a.vigente_desde ? p_desde : a.vigente_desde;
      return db.turnos.filter((t) => t.profesional_id === a.profesional_id && t.consultorio_id === a.consultorio_id && confirmado(t)
        && t.inicio > new Date().toISOString() && isodow(fLocal(t.inicio)) === a.dia_semana
        && fLocal(t.inicio) >= desde && fLocal(t.inicio) <= a.vigente_hasta).length;
    },
  };

  return {
    rpc(nombre, args = {}) {
      return new Promise((r) => setTimeout(r, 150)).then(() => {
        try { const data = funciones[nombre](args); guardar(); return { data, error: null }; } catch (e) { return { data: null, error: { message: e.message, hint: e.hint } }; }
      });
    },
    from: (tabla) => new Consulta(tabla),
    functions: {
      async invoke(nombre, { body = {} } = {}) {
        await new Promise((r) => setTimeout(r, 400));
        if (nombre === 'whatsapp' && body.accion === 'enviar') {
          // Respuesta de una persona desde la bandeja (en producción la manda la API de WhatsApp)
          if (!soyWhatsapp()) return { data: null, error: { message: 'No tenés acceso a la bandeja de WhatsApp' } };
          const c = db.wa_conversaciones.find((x) => x.telefono === body.telefono);
          if (!c) return { data: null, error: { message: 'No existe esa conversación' } };
          if (!c.ultimo_entrante || Date.parse(c.ultimo_entrante) < Date.now() - 24 * 3600e3) return { data: null, error: { message: 'Pasaron más de 24 horas desde el último mensaje del paciente. WhatsApp no deja escribirle hasta que vuelva a escribir (o con una plantilla aprobada).' } };
          wa.guardarSaliente(c.telefono, 'persona', String(body.texto || '').trim(), uid());
          Object.assign(c, conversacionNueva(c, { ...c, estado: 'humano' }), { estado: 'humano', atendida_por: uid(), no_leidos: 0 });
          guardar();
          return { data: { ok: true }, error: null };
        }
        if (nombre === 'ipc') return { data: null, error: { message: 'En la demostración no hay conexión con INDEC. Con la base real, el índice se baja solo todos los meses; también podés cargarlo a mano acá abajo.' } };
        return { data: null, error: { message: 'Función no disponible en la demostración' } };
      },
    },
    auth: {
      onAuthStateChange(cb) { avisarAuth = cb; setTimeout(() => cb('INITIAL_SESSION', sesion), 0); return { data: { subscription: { unsubscribe() {} } } }; },
      async signInWithOtp({ email }) {
        return db.profesionales.some((p) => p.email === email) ? { error: null } : { error: { message: 'Signups not allowed for otp' } };
      },
      async signOut() { sesion = null; guardar(); avisarAuth('SIGNED_OUT', null); return { error: null }; },
    },
    demo: {
      wa,
      entrarComo(id) { const p = db.profesionales.find((x) => x.id === id); sesion = { user: { id: p.id, email: p.email } }; guardar(); avisarAuth('SIGNED_IN', sesion); },
      reiniciar() { try { localStorage.removeItem(CLAVE); localStorage.removeItem(`${CLAVE}-sesion`); } catch { /* nada */ } },
    },
  };
}

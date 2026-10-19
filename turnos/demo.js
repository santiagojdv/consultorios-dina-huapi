// Modo demostración: una base simulada en el navegador que reemplaza a Supabase mientras
// turnos/config.js está vacío. Reproduce las reglas de supabase/schema.sql (sin superposiciones,
// turnos solo dentro de horarios alquilados, cada profesional ve solo a sus pacientes) para que
// todo el circuito se pueda probar antes de crear la base real. Los datos quedan en este navegador.
export function crearDemo() {
  const CLAVE = 'cdh-demo-v3';
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
      { id: 'demo-nati', email: 'natalia@ejemplo.com', nombre: 'Dra. Natalia Cárdenas', especialidad: 'Ortodoncia y estética facial', telefono: '2944636977', publico: true, bio: 'Directora del consultorio. Ortodoncia, alineadores, ortopedia maxilar y estética facial.', web: 'nati/' },
      { id: 'demo-gomez', email: 'martin.gomez@ejemplo.com', nombre: 'Dr. Martín Gómez (ejemplo)', especialidad: 'Odontología general', telefono: '2944654321', publico: true, duracion_turno: 45, bio: 'Profesional de ejemplo para la demostración.' },
      { id: 'demo-ruiz', email: 'laura.ruiz@ejemplo.com', nombre: 'Dra. Laura Ruiz (ejemplo)', especialidad: 'Endodoncia', telefono: '', publico: true, duracion_turno: 60, bio: 'Profesional de ejemplo para la demostración.' },
    ].map((p) => ({ duracion_turno: 30, anticipacion_horas: 2, ventana_dias: 30, aviso_cancelacion_horas: 12, activo: true, es_admin: false, bio: '', web: '', foto: '', ...p }));
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
    return { consultorios: [{ id: 1, nombre: 'Box 1', activo: true }, { id: 2, nombre: 'Box 2', activo: true }], profesionales: pros, alquileres, ausencias: [], turnos, calendario_tokens: [], seq: 1000 };
  }

  let db;
  try { db = JSON.parse(localStorage.getItem(CLAVE)); } catch { db = null; }
  if (!db?.profesionales || !db.calendario_tokens) db = semilla();
  let sesion = null;
  try { sesion = JSON.parse(localStorage.getItem(`${CLAVE}-sesion`)); } catch { sesion = null; }
  const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(db)); localStorage.setItem(`${CLAVE}-sesion`, JSON.stringify(sesion)); } catch { /* sin almacenamiento: la demo sigue en memoria */ } };
  let avisarAuth = () => {};

  const uid = () => sesion?.user?.id ?? null;
  const yo = () => db.profesionales.find((p) => p.id === uid());
  const soyActivo = () => Boolean(yo()?.activo);
  const soyAdmin = () => Boolean(yo()?.activo && yo()?.es_admin);
  const confirmado = (t) => t.estado === 'confirmado';

  function libres(pid, desde, hasta) {
    const p = db.profesionales.find((x) => x.id === pid && x.activo);
    const propio = uid() === pid;
    if (!p || !(p.publico || propio)) return [];
    const hoy = fLocal(new Date());
    const dur = p.duracion_turno;
    const desdeOk = propio ? new Date().toISOString() : masMin(new Date().toISOString(), p.anticipacion_horas * 60);
    const tope = propio ? hasta : [hasta, masDias(hoy, p.ventana_dias)].sort()[0];
    const out = [];
    for (let f = desde < hoy ? hoy : desde; f <= tope; f = masDias(f, 1)) {
      for (const a of db.alquileres) {
        if (a.profesional_id !== pid || a.dia_semana !== isodow(f) || f < a.vigente_desde || f > a.vigente_hasta) continue;
        for (let m = minutos(a.hora_inicio); m + dur <= minutos(a.hora_fin); m += dur) {
          const ini = inst(f, hhmmDe(m)), fin = masMin(ini, dur);
          if (ini < desdeOk) continue;
          if (db.turnos.some((t) => t.profesional_id === pid && confirmado(t) && pisa(t.inicio, t.fin, ini, fin))) continue;
          if (db.ausencias.some((x) => x.profesional_id === pid && pisa(x.desde, x.hasta, ini, fin))) continue;
          out.push({ inicio: ini, fin });
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

  const visibles = (tabla) => {
    const filas = db[tabla];
    if (tabla === 'calendario_tokens') return soyActivo() ? filas.filter((r) => r.profesional_id === uid()) : [];
    if (tabla === 'turnos' || tabla === 'ausencias') return soyActivo() ? filas.filter((r) => r.profesional_id === uid()) : [];
    if (tabla === 'profesionales') return filas.filter((r) => soyActivo() || r.id === uid());
    return soyActivo() ? filas : [];
  };

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
      return r;
    }
    forma(filas) {
      if (this.cabeza) return { data: null, error: null, count: filas.length };
      if (this.uno === 'quizas') return { data: filas[0] ?? null, error: null };
      if (this.uno === 'uno') return filas.length === 1 ? { data: filas[0], error: null } : { data: null, error: { message: 'No se encontró el registro' } };
      return { data: filas, error: null, count: this.conteo ? filas.length : null };
    }
    puedoEscribir() {
      if (['consultorios', 'alquileres'].includes(this.tabla) && !soyAdmin()) throw error('permiso denegado');
      if (!soyActivo()) throw error('permiso denegado');
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
      if (['consultorios', 'alquileres'].includes(t) && !soyAdmin()) return { data: [], error: null };
      const filas = this.filas().filter((r) => t !== 'profesionales' || r.id === uid() || soyAdmin());
      if (t === 'profesionales' && !soyAdmin() && ['es_admin', 'activo', 'email'].some((c) => c in this.cambios)) throw error('Solo un administrador puede cambiar esos datos');
      if (t === 'profesionales' && this.cambios.es_admin === false && filas.some((r) => r.id === uid())) throw error('No podés quitarte el rol de administrador a vos mismo');
      const actualizadas = filas.map((r) => {
        const nuevo = { ...r, ...this.cambios };
        if (t === 'alquileres') validarAlquiler(nuevo);
        if (t === 'turnos' && confirmado(nuevo) && (nuevo.inicio !== r.inicio || nuevo.fin !== r.fin)) validarTurno(nuevo);
        if (t === 'consultorios' && db.consultorios.some((c) => c.id !== r.id && c.nombre.toLowerCase() === String(nuevo.nombre).toLowerCase())) throw error('duplicate key value violates unique constraint');
        return nuevo;
      });
      for (const n of actualizadas) Object.assign(db[t].find((r) => r.id === n.id), n);
      return this.devolver ? this.forma(actualizadas) : { data: null, error: null };
    }
    _delete() {
      this.puedoEscribir();
      if (this.tabla === 'turnos') throw error('permiso denegado');
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
    turnos_disponibles: ({ p_profesional, p_desde, p_hasta }) => libres(p_profesional, p_desde, p_hasta),
    reservar_turno: ({ p_profesional, p_inicio, p_nombre, p_telefono, p_email }) => {
      const p = db.profesionales.find((x) => x.id === p_profesional && x.activo && x.publico);
      if (!p) throw error('Profesional no disponible');
      const f = fLocal(p_inicio);
      if (!libres(p.id, f, f).some((s) => s.inicio === p_inicio)) throw error('Ese horario ya no está disponible', 'ocupado');
      const norm = (t) => (t || '').replace(/\D/g, '').slice(-10);
      const futuros = db.turnos.filter((t) => confirmado(t) && t.inicio > new Date().toISOString() && norm(t.paciente_telefono) === norm(p_telefono));
      if (futuros.filter((t) => t.profesional_id === p.id).length >= 2 || futuros.length >= 4) throw error('Ya tenés varios turnos reservados con ese teléfono. Para más, comunicate con el profesional.', 'limite');
      const t = { id: ++db.seq, profesional_id: p.id, inicio: p_inicio, fin: masMin(p_inicio, p.duracion_turno), paciente_nombre: p_nombre.trim(), paciente_telefono: p_telefono.trim(), paciente_email: (p_email || '').trim().toLowerCase(), nota: '', origen: 'online', estado: 'confirmado', cancelado_por: null, token: uuid(), creado: new Date().toISOString() };
      validarTurno(t);
      db.turnos.push(t);
      return { token: t.token, inicio: t.inicio, fin: t.fin, profesional: p.nombre, especialidad: p.especialidad, consultorio: db.consultorios.find((c) => c.id === t.consultorio_id)?.nombre };
    },
    turno_por_token: ({ p_token }) => {
      const t = db.turnos.find((x) => x.token === p_token);
      if (!t) return null;
      const p = db.profesionales.find((x) => x.id === t.profesional_id);
      return { inicio: t.inicio, fin: t.fin, estado: t.estado, paciente: t.paciente_nombre, profesional: p.nombre, especialidad: p.especialidad, telefono_profesional: p.telefono, consultorio: db.consultorios.find((c) => c.id === t.consultorio_id)?.nombre, cancelable: confirmado(t) && t.inicio > masMin(new Date().toISOString(), p.aviso_cancelacion_horas * 60), aviso_cancelacion_horas: p.aviso_cancelacion_horas };
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
    auth: {
      onAuthStateChange(cb) { avisarAuth = cb; setTimeout(() => cb('INITIAL_SESSION', sesion), 0); return { data: { subscription: { unsubscribe() {} } } }; },
      async signInWithOtp({ email }) {
        return db.profesionales.some((p) => p.email === email) ? { error: null } : { error: { message: 'Signups not allowed for otp' } };
      },
      async signOut() { sesion = null; guardar(); avisarAuth('SIGNED_OUT', null); return { error: null }; },
    },
    demo: {
      entrarComo(id) { const p = db.profesionales.find((x) => x.id === id); sesion = { user: { id: p.id, email: p.email } }; guardar(); avisarAuth('SIGNED_IN', sesion); },
      reiniciar() { try { localStorage.removeItem(CLAVE); localStorage.removeItem(`${CLAVE}-sesion`); } catch { /* nada */ } },
    },
  };
}

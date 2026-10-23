// Planilla de precios: lee el CSV o Excel que arma Nati y lo convierte en filas para importar_aranceles.
// Acepta lo que suele salir de Excel en Argentina: separador ";" o ",", montos como "30.000" o
// "$ 30.000,50", meses como "10/2026" o "2026-10", y "Sí/No" en las columnas de verdadero/falso.

export const COLUMNAS = ['servicio', 'categoria', 'descripcion', 'duracion_min', 'reservable_online',
  'obra_social', 'modalidad', 'monto', 'valor_os', 'periodo_base', 'ajusta_ipc'];

const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** CSV → matriz, con comillas y separador detectado en la primera línea. */
export function leerCsv(texto) {
  texto = texto.replace(/^﻿/, '');
  const primera = texto.split(/\r?\n/, 1)[0];
  const sep = [';', '\t', ','].map((s) => [s, primera.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const filas = [];
  let fila = [], campo = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((x) => String(x).trim()));
}

/** Excel (.xlsx) → matriz. La librería se baja solo si hace falta. */
export async function leerExcel(buffer) {
  const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
  const libro = XLSX.read(buffer, { type: 'array' });
  const hoja = libro.Sheets[libro.SheetNames.find((n) => sinAcentos(n) === 'precios') ?? libro.SheetNames[0]];
  return XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: '' });
}

export function numero(v) {
  let t = String(v ?? '').replace(/[$\s]/g, '');
  if (!t) return null;
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else if (t.includes(',')) t = t.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error(`"${v}" no es un número`);
  return n;
}

function booleano(v) {
  const t = sinAcentos(v);
  if (!t) return '';
  if (['si', 's', 'true', 'verdadero', '1', 'x'].includes(t)) return true;
  if (['no', 'n', 'false', 'falso', '0'].includes(t)) return false;
  throw new Error(`"${v}" tiene que ser Sí o No`);
}

function modalidad(v) {
  const t = sinAcentos(v).replace(/\s+/g, '_');
  if (!t) return '';
  const mapa = { particular: 'particular', cubierto: 'cubierto', cubre: 'cubierto', copago: 'copago', adicional: 'copago',
    coseguro: 'copago', no_cubre: 'no_cubre', no_cubierto: 'no_cubre', sin_cobertura: 'no_cubre' };
  if (!mapa[t]) throw new Error(`modalidad "${v}" no válida (particular, cubierto, copago o no cubre)`);
  return mapa[t];
}

function mes(v) {
  const t = String(v ?? '').trim();
  if (!t) return '';
  let m = t.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-01`;
  m = t.match(/^(?:\d{1,2}\/)?(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}-01`;
  throw new Error(`mes base "${v}" no válido (usá 10/2026)`);
}

/** Matriz con encabezado → filas listas para importar. Devuelve { filas, errores }. */
export function interpretar(matriz) {
  if (!matriz.length) return { filas: [], errores: ['La planilla está vacía.'] };
  const enc = matriz[0].map((x) => sinAcentos(x).replace(/\s+/g, '_').replace(/[()]/g, ''));
  const alias = { duracion: 'duracion_min', duracion_minutos: 'duracion_min', online: 'reservable_online',
    obra_social_o_particular: 'obra_social', cobertura: 'obra_social', paga_el_paciente: 'monto', mes_base: 'periodo_base', ajusta_por_ipc: 'ajusta_ipc', valor_obra_social: 'valor_os' };
  const idx = Object.fromEntries(enc.map((c, i) => [alias[c] ?? c, i]));
  if (idx.servicio == null) return { filas: [], errores: ['Falta la columna "servicio" en la primera fila.'] };

  const filas = [], errores = [];
  matriz.slice(1).forEach((r, i) => {
    const v = (c) => (idx[c] == null ? '' : String(r[idx[c]] ?? '').trim());
    if (!v('servicio')) return;
    try {
      const f = {
        servicio: v('servicio'), categoria: v('categoria'), descripcion: v('descripcion'),
        duracion_min: v('duracion_min') ? Math.round(numero(v('duracion_min'))) : '',
        reservable_online: booleano(v('reservable_online')),
        obra_social: sinAcentos(v('obra_social')) === 'particular' ? '' : v('obra_social'),
        modalidad: modalidad(v('modalidad')),
        monto: numero(v('monto')) ?? '', valor_os: numero(v('valor_os')) ?? '',
        periodo_base: mes(v('periodo_base')), ajusta_ipc: booleano(v('ajusta_ipc')),
      };
      // Sin monto, una fila particular o de copago solo da de alta el servicio (el precio queda para después)
      if (['particular', 'copago'].includes(f.modalidad) && f.monto === '') f.modalidad = '';
      else if (!f.modalidad && f.obra_social) f.modalidad = 'cubierto';
      if (!f.modalidad && f.monto !== '') f.modalidad = f.obra_social ? 'copago' : 'particular';
      if (f.modalidad === 'particular' && f.obra_social) throw new Error('"particular" va sin obra social');
      if (f.modalidad && f.modalidad !== 'particular' && !f.obra_social && f.modalidad !== '') throw new Error(`"${f.modalidad}" necesita una obra social`);
      if (f.duracion_min !== '' && (f.duracion_min < 10 || f.duracion_min > 240)) throw new Error('la duración va de 10 a 240 minutos');
      filas.push(f);
    } catch (e) {
      errores.push(`Fila ${i + 2}: ${e.message}`);
    }
  });
  return { filas, errores };
}

/** Filas → CSV con ";" (se abre bien con Excel en español). */
export function aCsv(filas, columnas = COLUMNAS) {
  const esc = (x) => {
    const t = x == null ? '' : typeof x === 'boolean' ? (x ? 'Sí' : 'No') : String(x);
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '﻿' + [columnas.join(';'), ...filas.map((f) => columnas.map((c) => esc(f[c])).join(';'))].join('\r\n');
}

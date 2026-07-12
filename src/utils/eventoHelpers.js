function parseRequisitos(input) {
  if (!input) return [];

  if (Array.isArray(input)) {
    return input.map(r => String(r).trim()).filter(Boolean);
  }

  if (typeof input === 'string') {
    const raw = input.trim();
    if (!raw) return [];

    try {
      if (raw.startsWith('[')) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map(r => String(r).trim()).filter(Boolean);
        }
      }
    } catch (_) { }

    return raw.split('\n').map(r => r.trim()).filter(Boolean);
  }

  return [];
}

function normalizeHora(input) {
  if (input === undefined || input === null) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const m = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;

  const h = Number(m[1]);
  const min = Number(m[2]);
  const sec = Number(m[3] ?? 0);

  if (!Number.isFinite(h) || !Number.isFinite(min) || !Number.isFinite(sec)) return null;
  if (h > 23 || min > 59 || sec > 59) return null;

  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function toOptionalNumber(value) {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function parseFechaHoraISO(fecha, hora) {
  const rawFecha = String(fecha ?? '').trim();
  const rawHora = String(hora ?? '').trim();
  if (!rawFecha || !rawHora) return null;

  const fechaParts = rawFecha.split('-').map(Number);
  const horaParts = rawHora.split(':').map(Number);
  if (fechaParts.length !== 3 || horaParts.length < 2) return null;

  const [y, m, d] = fechaParts;
  const [hh, mm, ss = 0] = horaParts;
  const date = new Date(y, m - 1, d, hh, mm, ss);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calcularEstadoAutomatico(evento, ahora = new Date()) {
  const estado = String(evento?.estado ?? '').trim();
  if (['Cancelado', 'Finalizado'].includes(estado)) return estado;

  const fechaHora = parseFechaHoraISO(evento?.fecha, evento?.hora);
  if (!fechaHora) return estado || 'Próximo';

  const duracionHoras = Number(process.env.EVENT_DURATION_HOURS ?? 2);
  const finEstimado = new Date(fechaHora.getTime() + (Number.isFinite(duracionHoras) ? duracionHoras : 2) * 60 * 60 * 1000);

  if (ahora < fechaHora) return 'Próximo';
  if (ahora >= fechaHora && ahora < finEstimado) return 'En curso';
  return 'Finalizado';
}

function validateDateTime(fecha, hora) {
  const rawFecha = String(fecha ?? '').trim();
  const rawHora = String(hora ?? '').trim();
  if (!rawFecha || !rawHora) return 'Faltan campos obligatorios';

  const fechaHora = new Date(`${rawFecha}T${rawHora.length === 5 ? `${rawHora}:00` : rawHora}`);
  if (Number.isNaN(fechaHora.getTime())) return 'Fecha u hora inválida';

  // Margen de tolerancia: entre que el usuario llena el formulario, hace
  // clic en "Crear evento", y la petición llega al servidor (que puede
  // tardar varios segundos, o hasta ~50s si el servicio estaba dormido),
  // pueden pasar varios minutos. Sin este margen, un evento válido en el
  // momento de enviarlo podía rechazarse solo por esa demora de red.
  const MARGEN_TOLERANCIA_MS = 15 * 60 * 1000; // 15 minutos
  const ahoraConMargen = new Date(Date.now() - MARGEN_TOLERANCIA_MS);

  if (fechaHora.getTime() < ahoraConMargen.getTime()) {
    return 'La fecha y hora no pueden ser anteriores al momento actual';
  }
  return null;
}

function validateCoordinates(latitud, longitud) {
  if (latitud !== null && !Number.isFinite(latitud)) return 'Latitud inválida';
  if (longitud !== null && !Number.isFinite(longitud)) return 'Longitud inválida';
  if (latitud !== null && (latitud < -90 || latitud > 90)) return 'Latitud fuera de rango';
  if (longitud !== null && (longitud < -180 || longitud > 180)) return 'Longitud fuera de rango';
  return null;
}

function toIsoDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toTime(date = new Date()) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}:00`;
}

module.exports = {
  parseRequisitos,
  normalizeHora,
  toOptionalNumber,
  parseFechaHoraISO,
  calcularEstadoAutomatico,
  validateDateTime,
  validateCoordinates,
  toIsoDate,
  toTime
};

const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { sql, getPool } = require('../database/db');
const auth = require('../middlewares/auth');
const soloRoles = require('../middlewares/roles');

const uploadDir = path.join(process.cwd(), 'uploads', 'eventos');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `evento_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

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

async function sincronizarEstadoAutomatico(pool, evento) {
  const nuevoEstado = calcularEstadoAutomatico(evento);
  const actual = String(evento?.estado ?? '').trim();
  if (nuevoEstado !== actual && Number(evento?.id_evento)) {
    await pool.request()
      .input('estado', sql.NVarChar(20), nuevoEstado)
      .input('id', sql.Int, Number(evento.id_evento))
      .query('UPDATE Evento SET estado = @estado WHERE id_evento = @id');
  }
  return { ...evento, estado: nuevoEstado };
}

function validateDateTime(fecha, hora) {
  const rawFecha = String(fecha ?? '').trim();
  const rawHora = String(hora ?? '').trim();
  if (!rawFecha || !rawHora) return 'Faltan campos obligatorios';

  const fechaHora = new Date(`${rawFecha}T${rawHora.length === 5 ? `${rawHora}:00` : rawHora}`);
  if (Number.isNaN(fechaHora.getTime())) return 'Fecha u hora inválida';

  const now = new Date();
  if (fechaHora.getTime() < now.getTime()) {
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

async function getRequisitosByEvento(pool, idEvento) {
  const result = await pool.request()
    .input('id', sql.Int, idEvento)
    .query(`
      SELECT descripcion
      FROM EventoRequisito
      WHERE id_evento = @id
      ORDER BY orden ASC, id_requisito ASC
    `);

  return result.recordset.map(r => r.descripcion);
}

async function getOrganizadorByUsuarioId(pool, idUsuario) {
  const result = await pool.request()
    .input('idU', sql.Int, idUsuario)
    .query(`
      SELECT id_organizador, nombre_organizacion
      FROM Organizador
      WHERE id_usuario = @idU
    `);

  return result.recordset[0] || null;
}

async function ensureAdminOrganizer(pool, idUsuario) {
  const existing = await getOrganizadorByUsuarioId(pool, idUsuario);
  if (existing) return existing;

  const inserted = await pool.request()
    .input('idU', sql.Int, idUsuario)
    .input('org', sql.NVarChar(100), 'Administrador')
    .query(`
      DECLARE @Ids TABLE (id_organizador INT);

      INSERT INTO Organizador (id_usuario, nombre_organizacion)
      OUTPUT INSERTED.id_organizador INTO @Ids
      VALUES (@idU, @org);

      SELECT TOP 1 id_organizador FROM @Ids;
    `);

  return {
    id_organizador: inserted.recordset[0].id_organizador,
    nombre_organizacion: 'Administrador'
  };
}

async function getEventoById(pool, idEvento) {
  const result = await pool.request()
    .input('id', sql.Int, idEvento)
    .query(`
      SELECT
        e.id_evento,
        e.nombre,
        e.descripcion,
        CONVERT(VARCHAR(10), e.fecha, 23) AS fecha,
        CONVERT(VARCHAR(8), e.hora, 108) AS hora,
        e.ubicacion,
        e.capacidad,
        ISNULL((SELECT COUNT(*) FROM Inscripcion i WHERE i.id_evento = e.id_evento AND i.estado <> N'Cancelado'), 0) AS inscritos,
        e.estado,
        e.latitud,
        e.longitud,
        e.imagen_url,
        e.id_tipo,
        e.id_organizador,
        t.nombre AS tipo,
        u.nombre AS organizador,
        u.id_usuario AS id_usuario_organizador,
        o.nombre_organizacion AS organizacion
      FROM Evento e
      INNER JOIN TipoEvento t ON e.id_tipo = t.id_tipo
      INNER JOIN Organizador o ON e.id_organizador = o.id_organizador
      INNER JOIN Usuario u ON o.id_usuario = u.id_usuario
      WHERE e.id_evento = @id
        AND ISNULL(e.archivado, 0) = 0
    `);

  if (!result.recordset[0]) return null;
  let evento = result.recordset[0];
  evento.requisitos = await getRequisitosByEvento(pool, idEvento);
  evento = await sincronizarEstadoAutomatico(pool, evento);
  return evento;
}

async function registrarCambioEstadoEvento(pool, idEvento, estado, idUsuario) {
  const evento = await getEventoById(pool, idEvento);
  if (!evento) return;

  const titulo = estado === 'Cancelado' ? 'Evento cancelado' : 'Evento finalizado';
  const mensaje = estado === 'Cancelado'
    ? `El evento "${evento.nombre}" fue cancelado.`
    : `El evento "${evento.nombre}" fue finalizado.`;

  await pool.request()
    .input('titulo', sql.NVarChar(150), titulo)
    .input('mensaje', sql.NVarChar(sql.MAX), mensaje)
    .input('idUser', sql.Int, idUsuario)
    .input('idEvento', sql.Int, idEvento)
    .query(`
      INSERT INTO Notificacion (titulo, mensaje, id_usuario, id_evento)
      VALUES (@titulo, @mensaje, @idUser, @idEvento)
    `);
}

async function resolveEventPayload(req, pool, existingEvento = null) {
  const {
    nombre,
    descripcion,
    fecha,
    hora,
    ubicacion,
    capacidad,
    idTipo,
    idOrganizador,
    latitud,
    longitud,
    requisitos,
    imagenUrl
  } = req.body;

  const nombreLimpio = String(nombre ?? '').trim();
  const descripcionLimpia = String(descripcion ?? '').trim();
  const fechaLimpia = String(fecha ?? '').trim();
  const horaNormalizada = normalizeHora(hora);
  const ubicacionLimpia = String(ubicacion ?? '').trim();
  const tipoId = Number(idTipo);

  if (!nombreLimpio || !descripcionLimpia || !fechaLimpia || !horaNormalizada || !ubicacionLimpia || !tipoId) {
    return { error: 'Faltan campos obligatorios' };
  }

  const datetimeError = validateDateTime(fechaLimpia, horaNormalizada);
  if (datetimeError) {
    return { error: datetimeError };
  }

  const lat = toOptionalNumber(latitud);
  const lon = toOptionalNumber(longitud);
  const coordError = validateCoordinates(lat, lon);
  if (coordError) {
    return { error: coordError };
  }

  const capacidadNum = Number(capacidad);
  if (!Number.isFinite(capacidadNum) || capacidadNum < 1) {
    return { error: 'La capacidad debe ser al menos 1' };
  }
  if (capacidadNum > 50) {
    return { error: 'La capacidad máxima permitida es 50 voluntarios' };
  }

  let idOrgReal = null;
  if (req.usuario.rol === 'organizador') {
    const org = await getOrganizadorByUsuarioId(pool, req.usuario.id);
    idOrgReal = org?.id_organizador || null;
  } else if (req.usuario.rol === 'admin') {
    const idOrgDesdeBody = Number(idOrganizador);
    if (Number.isFinite(idOrgDesdeBody) && idOrgDesdeBody > 0) {
      const orgExiste = await pool.request()
        .input('idOrg', sql.Int, idOrgDesdeBody)
        .query('SELECT id_organizador FROM Organizador WHERE id_organizador = @idOrg');

      if (!orgExiste.recordset.length) {
        return { error: 'El organizador seleccionado no existe' };
      }
      idOrgReal = idOrgDesdeBody;
    } else if (existingEvento?.id_organizador) {
      idOrgReal = Number(existingEvento.id_organizador);
    } else {
      const orgAdmin = await ensureAdminOrganizer(pool, req.usuario.id);
      idOrgReal = Number(orgAdmin.id_organizador);
    }
  }

  if (!idOrgReal) {
    return {
      error: req.usuario.rol === 'organizador'
        ? 'No se encontró el organizador asociado a tu cuenta'
        : 'No se pudo determinar el organizador del evento'
    };
  }

  let imagenFinal = null;
  if (req.file) {
    imagenFinal = `/uploads/eventos/${req.file.filename}`;
  } else {
    const imagenLimpia = imagenUrl === undefined || imagenUrl === null ? '' : String(imagenUrl).trim();
    if (imagenLimpia) {
      imagenFinal = imagenLimpia;
    } else if (existingEvento) {
      imagenFinal = existingEvento.imagen_url || null;
    }
  }

  return {
    nombre: nombreLimpio,
    descripcion: descripcionLimpia,
    fecha: fechaLimpia,
    hora: horaNormalizada,
    ubicacion: ubicacionLimpia,
    capacidad: capacidadNum,
    idTipo: tipoId,
    idOrgReal,
    latitud: lat,
    longitud: lon,
    imagenFinal,
    requisitos: parseRequisitos(requisitos)
  };
}

// GET /api/eventos
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();

    const where = [];
    if (req.query.tipo) {
      where.push('t.nombre = @tipo');
      request.input('tipo', sql.NVarChar, req.query.tipo);
    }
    where.push('ISNULL(e.archivado, 0) = 0');
    if (req.query.estado) {
      where.push('e.estado = @estado');
      request.input('estado', sql.NVarChar, req.query.estado);
    } else {
      where.push("e.estado IN ('Próximo', 'En curso')");
    }

    const result = await request.query(`
      SELECT
        e.id_evento,
        e.nombre,
        e.descripcion,
        CONVERT(VARCHAR(10), e.fecha, 23) AS fecha,
        CONVERT(VARCHAR(8), e.hora, 108) AS hora,
        e.ubicacion,
        e.capacidad,
        ISNULL((SELECT COUNT(*) FROM Inscripcion i WHERE i.id_evento = e.id_evento AND i.estado <> N'Cancelado'), 0) AS inscritos,
        e.estado,
        e.latitud,
        e.longitud,
        e.imagen_url,
        t.nombre AS tipo,
        u.nombre AS organizador,
        u.id_usuario AS id_usuario_organizador,
        o.nombre_organizacion AS organizacion
      FROM Evento e
      INNER JOIN TipoEvento t ON e.id_tipo = t.id_tipo
      INNER JOIN Organizador o ON e.id_organizador = o.id_organizador
      INNER JOIN Usuario u ON o.id_usuario = u.id_usuario
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY e.fecha DESC, e.hora DESC, e.id_evento DESC
    `);

    const data = [];
    for (const ev of result.recordset) {
      const requisitos = await getRequisitosByEvento(pool, ev.id_evento);
      const normalizado = await sincronizarEstadoAutomatico(pool, { ...ev, requisitos });
      data.push(normalizado);
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// GET /api/eventos/gestion
// Panel de administración: admin ve todos; organizador ve solo sus eventos
router.get('/gestion', auth, soloRoles('admin', 'organizador'), async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();

    let extraWhere = 'WHERE ISNULL(e.archivado, 0) = 0';
    if (req.usuario.rol === 'organizador') {
      const org = await getOrganizadorByUsuarioId(pool, req.usuario.id);
      if (!org) {
        return res.json([]);
      }
      request.input('idOrg', sql.Int, org.id_organizador);
      extraWhere = 'WHERE ISNULL(e.archivado, 0) = 0 AND e.id_organizador = @idOrg';
    }

    const result = await request.query(`
      SELECT
        e.id_evento,
        e.nombre,
        e.descripcion,
        CONVERT(VARCHAR(10), e.fecha, 23) AS fecha,
        CONVERT(VARCHAR(8), e.hora, 108) AS hora,
        e.ubicacion,
        e.capacidad,
        ISNULL((SELECT COUNT(*) FROM Inscripcion i WHERE i.id_evento = e.id_evento AND i.estado <> N'Cancelado'), 0) AS inscritos,
        e.estado,
        e.latitud,
        e.longitud,
        e.imagen_url,
        t.nombre AS tipo,
        u.nombre AS organizador,
        u.id_usuario AS id_usuario_organizador,
        o.nombre_organizacion AS organizacion,
        e.id_organizador
      FROM Evento e
      INNER JOIN TipoEvento t ON e.id_tipo = t.id_tipo
      INNER JOIN Organizador o ON e.id_organizador = o.id_organizador
      INNER JOIN Usuario u ON o.id_usuario = u.id_usuario
      ${extraWhere}
      ORDER BY e.fecha DESC, e.hora DESC, e.id_evento DESC
    `);

    const data = [];
    for (const ev of result.recordset) {
      const requisitos = await getRequisitosByEvento(pool, ev.id_evento);
      const normalizado = await sincronizarEstadoAutomatico(pool, { ...ev, requisitos });
      data.push(normalizado);
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// IMPORTANTE: esta ruta debe ir ANTES de /:id
router.get('/organizadores/lista', auth, soloRoles('admin'), async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        o.id_organizador,
        o.id_usuario,
        u.nombre,
        u.email,
        o.nombre_organizacion
      FROM Organizador o
      INNER JOIN Usuario u ON o.id_usuario = u.id_usuario
      WHERE u.activo = 1
      ORDER BY u.nombre ASC
    `);

    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/eventos/:id
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const evento = await getEventoById(pool, Number(req.params.id));

    if (!evento) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }

    const requisitos = await getRequisitosByEvento(pool, Number(req.params.id));
    res.json({ ...evento, requisitos });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/eventos
router.post(
  '/',
  auth,
  soloRoles('admin', 'organizador'),
  upload.single('imagen'),
  async (req, res) => {
    try {
      const pool = await getPool();
      const resolved = await resolveEventPayload(req, pool);

      if (resolved.error) {
        return res.status(400).json({ message: resolved.error });
      }

      const {
        nombre,
        descripcion,
        fecha,
        hora,
        ubicacion,
        capacidad,
        idTipo,
        idOrgReal,
        latitud,
        longitud,
        imagenFinal,
        requisitos
      } = resolved;

      const ins = await pool.request()
        .input('nombre', sql.NVarChar(200), nombre)
        .input('descripcion', sql.NVarChar(sql.MAX), descripcion)
        .input('fecha', sql.Date, fecha)
        .input('hora', sql.NVarChar(8), hora)
        .input('ubicacion', sql.NVarChar(300), ubicacion)
        .input('capacidad', sql.Int, capacidad)
        .input('idTipo', sql.Int, idTipo)
        .input('idOrg', sql.Int, idOrgReal)
        .input('latitud', sql.Float, latitud)
        .input('longitud', sql.Float, longitud)
        .input('imagenUrl', sql.NVarChar(500), imagenFinal)
        .query(`
          INSERT INTO Evento (
            nombre, descripcion, fecha, hora, ubicacion, capacidad,
            id_tipo, id_organizador, latitud, longitud, imagen_url
          )
          OUTPUT INSERTED.id_evento
          VALUES (
            @nombre, @descripcion, @fecha, CONVERT(time, @hora), @ubicacion, @capacidad,
            @idTipo, @idOrg, @latitud, @longitud, @imagenUrl
          )
        `);

      const newId = ins.recordset[0].id_evento;

      for (let i = 0; i < requisitos.length; i++) {
        await pool.request()
          .input('idEv', sql.Int, newId)
          .input('desc', sql.NVarChar(250), requisitos[i])
          .input('orden', sql.Int, i + 1)
          .query(`
            INSERT INTO EventoRequisito (id_evento, descripcion, orden)
            VALUES (@idEv, @desc, @orden)
          `);
      }

      res.status(201).json({ id: newId, message: 'Evento creado correctamente' });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// PUT /api/eventos/:id
router.put(
  '/:id',
  auth,
  soloRoles('admin', 'organizador'),
  upload.single('imagen'),
  async (req, res) => {
    try {
      const idEvento = Number(req.params.id);
      const pool = await getPool();
      const eventoActual = await getEventoById(pool, idEvento);

      if (!eventoActual) {
        return res.status(404).json({ message: 'Evento no encontrado' });
      }

      if (req.usuario.rol === 'organizador' || req.usuario.rol === 'admin') {
        if (Number(eventoActual.id_usuario_organizador) !== Number(req.usuario.id)) {
          return res.status(403).json({ message: 'Sin permisos suficientes' });
        }
      }

      const resolved = await resolveEventPayload(req, pool, eventoActual);
      if (resolved.error) {
        return res.status(400).json({ message: resolved.error });
      }

      const {
        nombre,
        descripcion,
        fecha,
        hora,
        ubicacion,
        capacidad,
        idTipo,
        idOrgReal,
        latitud,
        longitud,
        imagenFinal,
        requisitos
      } = resolved;

      await pool.request()
        .input('id', sql.Int, idEvento)
        .input('nombre', sql.NVarChar(200), nombre)
        .input('descripcion', sql.NVarChar(sql.MAX), descripcion)
        .input('fecha', sql.Date, fecha)
        .input('hora', sql.NVarChar(8), hora)
        .input('ubicacion', sql.NVarChar(300), ubicacion)
        .input('capacidad', sql.Int, capacidad)
        .input('idTipo', sql.Int, idTipo)
        .input('idOrg', sql.Int, idOrgReal)
        .input('latitud', sql.Float, latitud)
        .input('longitud', sql.Float, longitud)
        .input('imagenUrl', sql.NVarChar(500), imagenFinal)
        .query(`
          UPDATE Evento
          SET
            nombre = @nombre,
            descripcion = @descripcion,
            fecha = @fecha,
            hora = CONVERT(time, @hora),
            ubicacion = @ubicacion,
            capacidad = @capacidad,
            id_tipo = @idTipo,
            id_organizador = @idOrg,
            latitud = @latitud,
            longitud = @longitud,
            imagen_url = @imagenUrl
          WHERE id_evento = @id
        `);

      await pool.request()
        .input('idEv', sql.Int, idEvento)
        .query('DELETE FROM EventoRequisito WHERE id_evento = @idEv');

      for (let i = 0; i < requisitos.length; i++) {
        await pool.request()
          .input('idEv', sql.Int, idEvento)
          .input('desc', sql.NVarChar(250), requisitos[i])
          .input('orden', sql.Int, i + 1)
          .query(`
            INSERT INTO EventoRequisito (id_evento, descripcion, orden)
            VALUES (@idEv, @desc, @orden)
          `);
      }

      res.json({ ok: true, message: 'Evento actualizado correctamente' });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// PATCH /api/eventos/:id/estado
router.patch('/:id/estado', auth, soloRoles('admin', 'organizador'), async (req, res) => {
  const estados = ['Próximo', 'En curso', 'Finalizado', 'Cancelado'];
  if (!estados.includes(req.body.estado)) {
    return res.status(400).json({ message: 'Estado inválido' });
  }

  try {
    const pool = await getPool();
    const evento = await getEventoById(pool, Number(req.params.id));

    if (!evento) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }

    if (req.usuario.rol === 'organizador' || req.usuario.rol === 'admin') {
      if (Number(evento.id_usuario_organizador) !== Number(req.usuario.id)) {
        return res.status(403).json({ message: 'Sin permisos suficientes' });
      }
    }

    if (evento.estado !== req.body.estado) {
      await pool.request()
        .input('estado', sql.NVarChar(13), req.body.estado)
        .input('id', sql.Int, req.params.id)
        .query('UPDATE Evento SET estado = @estado WHERE id_evento = @id');

      if (req.body.estado === 'Cancelado' || req.body.estado === 'Finalizado') {
        await registrarCambioEstadoEvento(pool, Number(req.params.id), req.body.estado, req.usuario.id);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/eventos/:id
// Archivo lógico: solo oculta el evento del listado global sin borrar su historial
router.delete('/:id', auth, soloRoles('admin', 'organizador'), async (req, res) => {
  try {
    const pool = await getPool();
    const evento = await getEventoById(pool, Number(req.params.id));

    if (!evento) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }

    if (req.usuario.rol === 'organizador') {
      if (Number(evento.id_usuario_organizador) !== Number(req.usuario.id)) {
        return res.status(403).json({ message: 'Sin permisos suficientes' });
      }
    }

    await pool.request()
      .input('id', sql.Int, Number(req.params.id))
      .query('UPDATE Evento SET archivado = 1 WHERE id_evento = @id');

    res.json({ ok: true, archivado: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
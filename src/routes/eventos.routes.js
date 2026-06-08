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
        e.inscritos,
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
    `);

  if (!result.recordset[0]) return null;
  const evento = result.recordset[0];
  evento.requisitos = await getRequisitosByEvento(pool, idEvento);
  return evento;
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

  const lat = toOptionalNumber(latitud);
  const lon = toOptionalNumber(longitud);
  const coordError = validateCoordinates(lat, lon);
  if (coordError) {
    return { error: coordError };
  }

  let idOrgReal = null;
  if (req.usuario.rol === 'organizador') {
    const org = await getOrganizadorByUsuarioId(pool, req.usuario.id);
    idOrgReal = org?.id_organizador || null;
  } else if (req.usuario.rol === 'admin') {
    idOrgReal = Number(idOrganizador) > 0 ? Number(idOrganizador) : null;
    if (!idOrgReal) {
      return { error: 'Debes enviar idOrganizador válido' };
    }

    const orgExiste = await pool.request()
      .input('idOrg', sql.Int, idOrgReal)
      .query('SELECT id_organizador FROM Organizador WHERE id_organizador = @idOrg');

    if (!orgExiste.recordset.length) {
      return { error: 'El organizador seleccionado no existe' };
    }
  }

  if (!idOrgReal) {
    return {
      error: req.usuario.rol === 'organizador'
        ? 'No se encontró el organizador asociado a tu cuenta'
        : 'Debes enviar idOrganizador válido'
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
    capacidad: Number.isFinite(Number(capacidad)) ? Number(capacidad) : 30,
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
    if (req.query.estado) {
      where.push('e.estado = @estado');
      request.input('estado', sql.NVarChar, req.query.estado);
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
        e.inscritos,
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
      data.push({ ...ev, requisitos });
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

    let extraWhere = '';
    if (req.usuario.rol === 'organizador') {
      const org = await getOrganizadorByUsuarioId(pool, req.usuario.id);
      if (!org) {
        return res.json([]);
      }
      request.input('idOrg', sql.Int, org.id_organizador);
      extraWhere = 'WHERE e.id_organizador = @idOrg';
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
        e.inscritos,
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
      data.push({ ...ev, requisitos });
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

      if (req.usuario.rol === 'organizador') {
        const org = await getOrganizadorByUsuarioId(pool, req.usuario.id);
        if (!org || Number(eventoActual.id_organizador) !== Number(org.id_organizador)) {
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

    if (req.usuario.rol === 'organizador') {
      const org = await getOrganizadorByUsuarioId(pool, req.usuario.id);
      if (!org || Number(evento.id_organizador) !== Number(org.id_organizador)) {
        return res.status(403).json({ message: 'Sin permisos suficientes' });
      }
    }

    await pool.request()
      .input('estado', sql.NVarChar(13), req.body.estado)
      .input('id', sql.Int, req.params.id)
      .query('UPDATE Evento SET estado = @estado WHERE id_evento = @id');

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/eventos/:id
router.delete('/:id', auth, soloRoles('admin', 'organizador'), async (req, res) => {
  try {
    const pool = await getPool();
    const evento = await getEventoById(pool, Number(req.params.id));

    if (!evento) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }

    if (req.usuario.rol === 'organizador') {
      const org = await getOrganizadorByUsuarioId(pool, req.usuario.id);
      if (!org || Number(evento.id_organizador) !== Number(org.id_organizador)) {
        return res.status(403).json({ message: 'Sin permisos suficientes' });
      }
    }

    const idEvento = Number(req.params.id);

    await pool.request()
      .input('id', sql.Int, idEvento)
      .query('DELETE FROM Notificacion WHERE id_evento = @id');

    await pool.request()
      .input('id', sql.Int, idEvento)
      .query('DELETE FROM Inscripcion WHERE id_evento = @id');

    await pool.request()
      .input('id', sql.Int, idEvento)
      .query('DELETE FROM EventoRequisito WHERE id_evento = @id');

    await pool.request()
      .input('id', sql.Int, idEvento)
      .query('DELETE FROM Evento WHERE id_evento = @id');

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
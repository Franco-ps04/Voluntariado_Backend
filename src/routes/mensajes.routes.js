const router = require('express').Router();
const { sql, getPool } = require('../database/db');
const auth = require('../middlewares/auth');
const soloRoles = require('../middlewares/roles');

async function getHistorial(pool, idMensaje) {
  const result = await pool.request()
    .input('idMensaje', sql.Int, idMensaje)
    .query(`
      SELECT
        r.id_respuesta,
        r.texto,
        CONVERT(VARCHAR(19), r.fecha, 120) AS fecha,
        u.nombre AS respondido_por,
        u.rol AS rol_usuario,
        CASE
          WHEN u.rol = 'voluntario' THEN 'voluntario'
          ELSE 'admin'
        END AS tipo
      FROM RespuestaMensaje r
      INNER JOIN Usuario u ON r.id_usuario = u.id_usuario
      WHERE r.id_mensaje = @idMensaje
      ORDER BY r.fecha ASC, r.id_respuesta ASC
    `);

  return result.recordset;
}

async function obtenerMensajeBase(pool, idMensaje) {
  const result = await pool.request()
    .input('id', sql.Int, idMensaje)
    .query(`
      SELECT TOP 1
        m.id_mensaje,
        m.asunto,
        m.mensaje,
        CONVERT(VARCHAR(19), m.fecha, 120) AS fecha,
        m.leido,
        m.leido_por_voluntario,
        m.respondido,
        m.id_voluntario AS idRemitente,
        m.id_usuario_destino AS idDestinatario,
        u1.nombre AS remitente,
        u1.email AS emailRemitente,
        u2.nombre AS destinatario,
        u2.email AS emailDestinatario,
        u2.rol AS rolDestinatario,
        e.nombre AS eventoRelacionado
      FROM Mensaje m
      INNER JOIN Usuario u1 ON m.id_voluntario = u1.id_usuario
      INNER JOIN Usuario u2 ON m.id_usuario_destino = u2.id_usuario
      LEFT JOIN Evento e ON m.id_evento = e.id_evento
      WHERE m.id_mensaje = @id
    `);

  return result.recordset[0] || null;
}


// GET /api/mensajes/destinatarios
// Lista de administradores/organizadores activos para que el voluntario elija a quién escribir
router.get('/destinatarios', auth, soloRoles('voluntario'), async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`
        SELECT
          u.id_usuario,
          u.nombre,
          u.email,
          u.rol
        FROM Usuario u
        WHERE u.activo = 1
          AND u.rol IN ('admin', 'organizador')
        ORDER BY CASE WHEN u.rol = 'admin' THEN 0 ELSE 1 END, u.nombre ASC
      `);

    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/mensajes/mis
router.get('/mis', auth, soloRoles('voluntario'), async (req, res) => {
  try {
    const pool = await getPool();

    const msgs = await pool.request()
      .input('id', sql.Int, req.usuario.id)
      .query(`
        SELECT
          m.id_mensaje,
          m.asunto,
          m.mensaje,
          CONVERT(VARCHAR(19), m.fecha, 120) AS fecha,
          m.leido,
          m.leido_por_voluntario,
          m.respondido,
          m.id_voluntario AS idRemitente,
          m.id_usuario_destino AS idDestinatario,
          u.nombre AS remitente,
          u.email AS emailRemitente,
          u2.nombre AS destinatario,
          u2.rol AS rolDestinatario,
          e.nombre AS eventoRelacionado
        FROM Mensaje m
        INNER JOIN Usuario u ON m.id_voluntario = u.id_usuario
        INNER JOIN Usuario u2 ON m.id_usuario_destino = u2.id_usuario
        LEFT JOIN Evento e ON m.id_evento = e.id_evento
        WHERE m.id_voluntario = @id
        ORDER BY m.fecha DESC, m.id_mensaje DESC
      `);

    const data = [];
    for (const msg of msgs.recordset) {
      const historial = await getHistorial(pool, msg.id_mensaje);
      data.push({ ...msg, historial });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/mensajes
router.post('/', auth, soloRoles('voluntario'), async (req, res) => {
  const {
    idUsuarioDestino,
    idDestinatario,
    asunto,
    mensaje,
    idEvento
  } = req.body;

  const destino = Number(idUsuarioDestino || idDestinatario);

  if (!destino || !asunto || !mensaje) {
    return res.status(400).json({ message: 'Faltan campos obligatorios' });
  }

  try {
    const pool = await getPool();

    const destinoOk = await pool.request()
      .input('id', sql.Int, destino)
      .query(`
        SELECT id_usuario, rol
        FROM Usuario
        WHERE id_usuario = @id
          AND rol IN ('admin', 'organizador')
          AND activo = 1
      `);

    if (!destinoOk.recordset[0]) {
      return res.status(400).json({
        message: 'El destinatario debe ser un administrador u organizador activo'
      });
    }

    const insert = await pool.request()
      .input('asunto', sql.NVarChar(150), asunto)
      .input('mensaje', sql.NVarChar(sql.MAX), mensaje)
      .input('idVol', sql.Int, req.usuario.id)
      .input('idDest', sql.Int, destino)
      .input('idEvt', sql.Int, idEvento ? Number(idEvento) : null)
      .query(`
        INSERT INTO Mensaje (
          asunto, mensaje, id_voluntario, id_usuario_destino, id_evento
        )
        OUTPUT INSERTED.id_mensaje
        VALUES (
          @asunto, @mensaje, @idVol, @idDest, @idEvt
        )
      `);

    res.status(201).json({
      ok: true,
      id: insert.recordset[0].id_mensaje
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/mensajes/:id/seguimiento
router.post('/:id/seguimiento', auth, soloRoles('voluntario'), async (req, res) => {
  const { texto } = req.body;

  if (!texto || !texto.trim()) {
    return res.status(400).json({ message: 'El texto no puede estar vacío' });
  }

  try {
    const pool = await getPool();

    const check = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('idVol', sql.Int, req.usuario.id)
      .query(`
        SELECT id_mensaje
        FROM Mensaje
        WHERE id_mensaje = @id
          AND id_voluntario = @idVol
      `);

    if (!check.recordset[0]) {
      return res.status(404).json({ message: 'Mensaje no encontrado' });
    }

    await pool.request()
      .input('idMsg', sql.Int, req.params.id)
      .input('texto', sql.NVarChar(sql.MAX), texto.trim())
      .input('idUser', sql.Int, req.usuario.id)
      .query(`
        INSERT INTO RespuestaMensaje (id_mensaje, texto, id_usuario)
        VALUES (@idMsg, @texto, @idUser)
      `);

    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/mensajes/:id/leido
router.patch('/:id/leido', auth, soloRoles('voluntario'), async (req, res) => {
  try {
    const pool = await getPool();

    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('idVol', sql.Int, req.usuario.id)
      .query(`
        UPDATE Mensaje
        SET leido_por_voluntario = 1
        WHERE id_mensaje = @id
          AND id_voluntario = @idVol
      `);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/mensajes/panel
router.get('/panel', auth, soloRoles('admin', 'organizador'), async (req, res) => {
  try {
    const pool = await getPool();

    const msgs = await pool.request()
      .input('idDest', sql.Int, req.usuario.id)
      .query(`
        SELECT
          m.id_mensaje,
          m.asunto,
          m.mensaje,
          CONVERT(VARCHAR(19), m.fecha, 120) AS fecha,
          m.leido,
          m.leido_por_voluntario,
          m.respondido,
          m.id_voluntario AS idRemitente,
          m.id_usuario_destino AS idDestinatario,
          u.nombre AS remitente,
          u.email AS emailRemitente,
          u2.nombre AS destinatario,
          u2.rol AS rolDestinatario,
          e.nombre AS eventoRelacionado
        FROM Mensaje m
        INNER JOIN Usuario u ON m.id_voluntario = u.id_usuario
        INNER JOIN Usuario u2 ON m.id_usuario_destino = u2.id_usuario
        LEFT JOIN Evento e ON m.id_evento = e.id_evento
        WHERE m.id_usuario_destino = @idDest
        ORDER BY m.fecha DESC, m.id_mensaje DESC
      `);

    const data = [];
    for (const msg of msgs.recordset) {
      const historial = await getHistorial(pool, msg.id_mensaje);
      data.push({ ...msg, historial });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/mensajes/:id/marcar-leido
router.patch('/:id/marcar-leido', auth, soloRoles('admin', 'organizador'), async (req, res) => {
  try {
    const pool = await getPool();

    const check = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('idDest', sql.Int, req.usuario.id)
      .query(`
        SELECT id_mensaje
        FROM Mensaje
        WHERE id_mensaje = @id
          AND id_usuario_destino = @idDest
      `);

    if (!check.recordset[0]) {
      return res.status(404).json({ message: 'Mensaje no encontrado' });
    }

    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        UPDATE Mensaje
        SET leido = 1
        WHERE id_mensaje = @id
      `);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/mensajes/:id/responder
router.post('/:id/responder', auth, soloRoles('admin', 'organizador'), async (req, res) => {
  const { texto } = req.body;

  if (!texto || !texto.trim()) {
    return res.status(400).json({ message: 'La respuesta no puede estar vacía' });
  }

  try {
    const pool = await getPool();

    const check = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('idDest', sql.Int, req.usuario.id)
      .query(`
        SELECT id_mensaje
        FROM Mensaje
        WHERE id_mensaje = @id
          AND id_usuario_destino = @idDest
      `);

    if (!check.recordset[0]) {
      return res.status(404).json({ message: 'Mensaje no encontrado' });
    }

    await pool.request()
      .input('idMsg', sql.Int, req.params.id)
      .input('texto', sql.NVarChar(sql.MAX), texto.trim())
      .input('idUser', sql.Int, req.usuario.id)
      .query(`
        INSERT INTO RespuestaMensaje (id_mensaje, texto, id_usuario)
        VALUES (@idMsg, @texto, @idUser)
      `);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
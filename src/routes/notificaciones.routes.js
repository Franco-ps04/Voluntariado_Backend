const router = require('express').Router();
const { sql, getPool } = require('../database/db');
const auth = require('../middlewares/auth');
const soloRoles = require('../middlewares/roles');

function estadoKey(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function conteoPalabras(texto) {
    return String(texto ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .length;
}

// GET /api/notificaciones/mis
// Anuncios de los eventos donde el voluntario está inscrito
router.get('/mis', auth, soloRoles('voluntario'), async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.usuario.id)
            .query(`
        SELECT
          n.id_notificacion, n.titulo, n.mensaje,
          CONVERT(VARCHAR, n.fecha, 120) AS fecha,
          e.nombre  AS evento,
          e.estado  AS estado_evento,
          u.nombre  AS enviado_por,
          CASE WHEN nl.id_notificacion IS NOT NULL THEN 1 ELSE 0 END AS leida
        FROM Notificacion n
        JOIN Evento    e  ON n.id_evento = e.id_evento
                          AND ISNULL(e.archivado, 0) = 0
        JOIN Usuario   u  ON n.id_usuario = u.id_usuario
        JOIN Inscripcion i ON i.id_evento  = e.id_evento
                          AND i.id_voluntario = @id
                          AND i.estado != 'Cancelado'
        LEFT JOIN NotificacionLeida nl
               ON nl.id_notificacion = n.id_notificacion
              AND nl.id_voluntario   = @id
        ORDER BY n.fecha DESC
      `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// PATCH /api/notificaciones/:id/leida
// Voluntario marca un anuncio como leído
router.patch('/:id/leida', auth, soloRoles('voluntario'), async (req, res) => {
    try {
        const pool = await getPool();

        // Insertar solo si no existe (no duplicar)
        await pool.request()
            .input('idN', sql.Int, req.params.id)
            .input('idVol', sql.Int, req.usuario.id)
            .query(`IF NOT EXISTS (
                SELECT 1 FROM NotificacionLeida
                WHERE id_notificacion = @idN AND id_voluntario = @idVol
              )
              INSERT INTO NotificacionLeida (id_notificacion, id_voluntario)
              VALUES (@idN, @idVol)`);

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/notificaciones
// Admin u organizador crea un anuncio para un evento
// Body: { idEvento, titulo, mensaje }
router.post('/', auth, soloRoles('admin', 'organizador'), async (req, res) => {
    const { idEvento, titulo, mensaje } = req.body;
    const idEvt = Number(idEvento);
    const tituloLimpio = String(titulo ?? '').trim();
    const mensajeLimpio = String(mensaje ?? '').trim();

    if (!Number.isFinite(idEvt) || idEvt < 1) {
        return res.status(400).json({ message: 'Selecciona un evento válido' });
    }
    if (!tituloLimpio || !mensajeLimpio) {
        return res.status(400).json({ message: 'Faltan campos obligatorios' });
    }
    if (tituloLimpio.length > 150) {
        return res.status(400).json({ message: 'El título no debe superar 150 caracteres' });
    }
    if (conteoPalabras(mensajeLimpio) > 500) {
        return res.status(400).json({ message: 'El mensaje no debe superar 500 palabras' });
    }

    try {
        const pool = await getPool();

        const evento = await pool.request()
            .input('idEvt', sql.Int, idEvt)
            .query(`
              SELECT e.id_evento, e.estado
              FROM Evento e
              WHERE e.id_evento = @idEvt
                AND ISNULL(e.archivado, 0) = 0
            `);

        if (!evento.recordset[0]) {
            return res.status(404).json({ message: 'El evento no existe' });
        }

        const estado = estadoKey(evento.recordset[0].estado);
        if (estado === 'finalizado' || estado === 'cancelado') {
            return res.status(400).json({ message: 'Solo puedes enviar notificaciones a eventos activos' });
        }

        const ins = await pool.request()
            .input('titulo', sql.NVarChar(150), tituloLimpio)
            .input('mensaje', sql.NVarChar(sql.MAX), mensajeLimpio)
            .input('idUser', sql.Int, req.usuario.id)
            .input('idEvento', sql.Int, idEvt)
            .query(`INSERT INTO Notificacion (titulo, mensaje, id_usuario, id_evento)
              VALUES (@titulo, @mensaje, @idUser, @idEvento)
              SELECT CAST(SCOPE_IDENTITY() AS INT) AS id_notificacion;`);

        res.status(201).json({ id: ins.recordset[0].id_notificacion, ok: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ── GET /api/notificaciones ────────────────────────────────
// Notificaciones enviadas por el admin/org (para su panel)
router.get('/', auth, soloRoles('admin', 'organizador'), async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('idUser', sql.Int, req.usuario.id)
            .query(`
        SELECT n.id_notificacion, n.titulo, n.mensaje,
               CONVERT(VARCHAR, n.fecha, 120) AS fecha,
               e.nombre AS evento
        FROM Notificacion n
        JOIN Evento e ON n.id_evento = e.id_evento
        WHERE n.id_usuario = @idUser
        ORDER BY n.fecha DESC
      `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
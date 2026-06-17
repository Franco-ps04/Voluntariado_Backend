const router = require('express').Router();
const { sql, getPool } = require('../database/db');
const auth = require('../middlewares/auth');
const soloRoles = require('../middlewares/roles');

// GET /api/inscripciones/mis
// Inscripciones del voluntario autenticado, con datos de asistencia
router.get('/mis', auth, soloRoles('voluntario'), async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.usuario.id)
            .query(`
        SELECT
          i.id_inscripcion, i.fecha_inscripcion, i.estado,
          e.id_evento, e.nombre AS titulo, e.descripcion,
          CONVERT(VARCHAR, e.fecha, 23) AS fecha,
          CONVERT(VARCHAR, e.hora, 108) AS hora,
          e.ubicacion, e.capacidad, e.inscritos,
          e.latitud, e.longitud, e.imagen_url,
          t.nombre   AS tipo,
          u.nombre   AS organizador,
          u.id_usuario AS id_usuario_organizador,
          u.email AS email_organizador,
          a.asistio
        FROM Inscripcion i
        JOIN Evento      e ON i.id_evento    = e.id_evento
        JOIN TipoEvento  t ON e.id_tipo      = t.id_tipo
        JOIN Organizador o ON e.id_organizador = o.id_organizador
        JOIN Usuario     u ON o.id_usuario   = u.id_usuario
        LEFT JOIN Asistencia a ON i.id_inscripcion = a.id_inscripcion
        WHERE i.id_voluntario = @id
          AND ISNULL(e.archivado, 0) = 0
        ORDER BY e.fecha DESC
      `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/inscripciones?eventoId
// Inscritos de un evento (panel admin/org)
router.get('/', auth, soloRoles('admin', 'organizador'), async (req, res) => {
    const { eventoId } = req.query;
    if (!eventoId)
        return res.status(400).json({ message: 'eventoId es requerido' });

    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('evId', sql.Int, eventoId)
            .query(`
        SELECT
          i.id_inscripcion, i.fecha_inscripcion, i.estado,
          u.id_usuario, u.nombre, u.email, u.telefono,
          a.id_asistencia, a.asistio
        FROM Inscripcion  i
        JOIN Evento       e ON i.id_evento      = e.id_evento
        JOIN Usuario      u ON i.id_voluntario  = u.id_usuario
        LEFT JOIN Asistencia a ON i.id_inscripcion = a.id_inscripcion
        WHERE i.id_evento = @evId
          AND ISNULL(e.archivado, 0) = 0
        ORDER BY u.nombre
      `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/inscripciones
// Voluntario se inscribe a un evento
// Body: { idEvento }
router.post('/', auth, soloRoles('voluntario'), async (req, res) => {
    const { idEvento } = req.body;
    if (!idEvento)
        return res.status(400).json({ message: 'idEvento es requerido' });

    try {
        const pool = await getPool();

        // Verificar si ya existe una inscripción para este evento
        const existing = await pool.request()
            .input('idVol', sql.Int, req.usuario.id)
            .input('idEv', sql.Int, idEvento)
            .query(`SELECT id_inscripcion, estado
              FROM Inscripcion
              WHERE id_voluntario = @idVol AND id_evento = @idEv`);

        const row = existing.recordset[0];

        // Si ya está activa, no duplicar
        if (row && row.estado !== 'Cancelado')
            return res.status(409).json({ message: 'Ya estás inscrito en este evento' });

        // Verificar que el evento tenga cupo
        const evento = await pool.request()
            .input('idEv', sql.Int, idEvento)
            .query('SELECT capacidad, inscritos, estado FROM Evento WHERE id_evento = @idEv AND ISNULL(archivado, 0) = 0');

        const ev = evento.recordset[0];
        if (!ev)
            return res.status(404).json({ message: 'Evento no encontrado' });
        if (ev.estado !== 'Próximo' && ev.estado !== 'En curso')
            return res.status(400).json({ message: 'El evento no está disponible para inscripciones' });
        if (ev.inscritos >= ev.capacidad)
            return res.status(400).json({ message: 'El evento está lleno' });

        let newId = row?.id_inscripcion ?? null;

        if (row && row.estado === 'Cancelado') {
            await pool.request()
                .input('idIns', sql.Int, row.id_inscripcion)
                .query(`UPDATE Inscripcion
                        SET estado = N'Próximo'
                        WHERE id_inscripcion = @idIns`);

            // Reiniciar la asistencia para una nueva inscripción
            await pool.request()
                .input('idIns', sql.Int, row.id_inscripcion)
                .query(`DELETE FROM Asistencia
                        WHERE id_inscripcion = @idIns`);

            newId = row.id_inscripcion;
        } else {
            // Insert compatible con triggers habilitados en la tabla Inscripcion
            const inserted = await pool.request()
                .input('idVol', sql.Int, req.usuario.id)
                .input('idEv', sql.Int, idEvento)
                .query(`
                    DECLARE @Ids TABLE (id_inscripcion INT);
                    INSERT INTO Inscripcion (id_voluntario, id_evento)
                    OUTPUT INSERTED.id_inscripcion INTO @Ids
                    VALUES (@idVol, @idEv);

                    SELECT TOP 1 id_inscripcion
                    FROM @Ids;
                `);

            newId = inserted.recordset[0]?.id_inscripcion ?? null;
        }

        if (!newId) {
            return res.status(500).json({ message: 'No se pudo registrar la inscripción' });
        }

        await pool.request()
            .input('idEv', sql.Int, Number(idEvento))
            .query(`
                UPDATE Evento
                SET inscritos = CASE WHEN inscritos < capacidad THEN inscritos + 1 ELSE inscritos END
                WHERE id_evento = @idEv
            `);

        res.status(201).json({ id: newId, message: 'Inscripción realizada correctamente' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// PATCH /api/inscripciones/:id/cancelar
// Voluntario anula su propia inscripción
router.patch('/:id/cancelar', auth, soloRoles('voluntario'), async (req, res) => {
    try {
        const pool = await getPool();

        // Verificar que la inscripción pertenece al voluntario
        const check = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('idVol', sql.Int, req.usuario.id)
            .query(`SELECT id_inscripcion, estado FROM Inscripcion
              WHERE id_inscripcion = @id AND id_voluntario = @idVol`);

        if (!check.recordset[0])
            return res.status(404).json({ message: 'Inscripción no encontrada' });
        if (check.recordset[0].estado === 'Finalizado')
            return res.status(400).json({ message: 'No se puede cancelar un evento finalizado' });

        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`UPDATE Inscripcion SET estado = 'Cancelado' WHERE id_inscripcion = @id`);

        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                UPDATE e
                SET inscritos = CASE WHEN e.inscritos > 0 THEN e.inscritos - 1 ELSE 0 END
                FROM Evento e
                INNER JOIN Inscripcion i ON i.id_evento = e.id_evento
                WHERE i.id_inscripcion = @id
            `);

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
const router = require('express').Router();
const { sql, getPool } = require('../database/db');
const auth = require('../middlewares/auth');
const soloRoles = require('../middlewares/roles');


async function emitirCertificadosSiCorresponde(pool, idVoluntario) {
    const asist = await pool.request()
        .input('idVol', sql.Int, idVoluntario)
        .query(`
      SELECT COUNT(*) AS total
      FROM Asistencia a
      JOIN Inscripcion i ON a.id_inscripcion = i.id_inscripcion
      WHERE i.id_voluntario = @idVol AND a.asistio = 1
    `);

    const total = Number(asist.recordset[0]?.total ?? 0);
    const configs = await pool.request()
        .query('SELECT * FROM ConfigCertificado WHERE activo = 1 ORDER BY umbral');

    for (const cfg of configs.recordset) {
        if (total < Number(cfg.umbral ?? 0)) continue;

        const existe = await pool.request()
            .input('idVol', sql.Int, idVoluntario)
            .input('idCfg', sql.Int, cfg.id_config)
            .query('SELECT id_certificado FROM Certificado WHERE id_voluntario = @idVol AND id_config = @idCfg');

        if (existe.recordset.length > 0) continue;

        await pool.request()
            .input('titulo', sql.NVarChar, cfg.titulo)
            .input('motivo', sql.NVarChar, cfg.motivo)
            .input('color', sql.NVarChar, cfg.color)
            .input('cantidad', sql.Int, total)
            .input('idVol', sql.Int, idVoluntario)
            .input('idCfg', sql.Int, cfg.id_config)
            .query(`INSERT INTO Certificado
                (titulo, motivo, color, cantidad_participacion,
                 id_voluntario, id_config)
              VALUES (@titulo, @motivo, @color, @cantidad, @idVol, @idCfg)`);
    }
}

// GET /api/asistencia/:eventoId
// Lista de voluntarios + estado de asistencia de un evento
router.get('/:eventoId', auth, soloRoles('admin', 'organizador'), async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('evId', sql.Int, req.params.eventoId)
            .query(`
        SELECT
          i.id_inscripcion,
          u.id_usuario, u.nombre, u.email, u.telefono,
          a.id_asistencia, a.asistio,
          CONVERT(VARCHAR, a.fecha_registro, 120) AS fecha_registro
        FROM Inscripcion  i
        JOIN Voluntario   v ON i.id_voluntario     = v.id_usuario
        JOIN Usuario      u ON v.id_usuario        = u.id_usuario
        LEFT JOIN Asistencia a ON i.id_inscripcion = a.id_inscripcion
        WHERE i.id_evento = @evId
          AND i.estado != 'Cancelado'
        ORDER BY u.nombre
      `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// PUT /api/asistencia/:inscripcionId
// Registrar o actualizar asistencia de un voluntario
// Body: { asistio: true | false }
// El TRIGGER TR_Asistencia_Certificado emitirá certificados
// automáticamente si asistio pasa a true.
router.put('/:inscripcionId', auth, soloRoles('admin', 'organizador'), async (req, res) => {
    const { asistio } = req.body;
    if (typeof asistio !== 'boolean')
        return res.status(400).json({ message: 'asistio debe ser true o false' });

    try {
        const pool = await getPool();

        // Verificar que existe la asistencia
        const check = await pool.request()
            .input('idIns', sql.Int, req.params.inscripcionId)
            .query('SELECT id_asistencia FROM Asistencia WHERE id_inscripcion = @idIns');

        if (!check.recordset[0]) {
            // Crear si no existe
            await pool.request()
                .input('idIns', sql.Int, req.params.inscripcionId)
                .input('asistio', sql.Bit, asistio ? 1 : 0)
                .query(`INSERT INTO Asistencia (id_inscripcion, asistio)
                VALUES (@idIns, @asistio)`);
        } else {
            // Actualizar — el trigger se disparará aquí si asistio = 1
            await pool.request()
                .input('idIns', sql.Int, req.params.inscripcionId)
                .input('asistio', sql.Bit, asistio ? 1 : 0)
                .query(`UPDATE Asistencia
                SET asistio = @asistio, fecha_registro = GETDATE()
                WHERE id_inscripcion = @idIns`);
        }

        // Actualizar estado de la inscripción si el evento finalizó
        if (asistio) {
            await pool.request()
                .input('idIns', sql.Int, req.params.inscripcionId)
                .query(`UPDATE Inscripcion SET estado = 'Finalizado'
                WHERE id_inscripcion = @idIns`);

            const ins = await pool.request()
                .input('idIns', sql.Int, req.params.inscripcionId)
                .query('SELECT id_voluntario FROM Inscripcion WHERE id_inscripcion = @idIns');

            const idVol = ins.recordset[0]?.id_voluntario;
            if (idVol) {
                await emitirCertificadosSiCorresponde(pool, Number(idVol));
            }
        }

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
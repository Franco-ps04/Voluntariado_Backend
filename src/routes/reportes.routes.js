const router = require('express').Router();
const { sql, getPool } = require('../database/db');
const auth = require('../middlewares/auth');
const soloRoles = require('../middlewares/roles');

router.get('/resumen', auth, soloRoles('admin', 'organizador'), async (req, res) => {
    try {
        const pool = await getPool();

        const eventos = await pool.request().query(`
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
        o.nombre_organizacion AS organizacion,
        COALESCE(asist.asistieron, 0) AS asistieron,
        COALESCE(asist.noAsistieron, 0) AS noAsistieron
      FROM Evento e
      INNER JOIN TipoEvento t ON e.id_tipo = t.id_tipo
      INNER JOIN Organizador o ON e.id_organizador = o.id_organizador
      INNER JOIN Usuario u ON o.id_usuario = u.id_usuario
      LEFT JOIN (
        SELECT
          i.id_evento,
          SUM(CASE WHEN a.asistio = 1 THEN 1 ELSE 0 END) AS asistieron,
          SUM(CASE WHEN a.asistio = 0 THEN 1 ELSE 0 END) AS noAsistieron
        FROM Inscripcion i
        LEFT JOIN Asistencia a ON a.id_inscripcion = i.id_inscripcion
        GROUP BY i.id_evento
      ) asist ON asist.id_evento = e.id_evento
      ORDER BY e.fecha DESC, e.hora DESC, e.id_evento DESC
    `);

        const voluntarios = await pool.request().query(`
      SELECT TOP 10
        u.id_usuario,
        u.nombre,
        COUNT(i.id_inscripcion) AS eventos
      FROM Usuario u
      INNER JOIN Voluntario v ON u.id_usuario = v.id_usuario
      LEFT JOIN Inscripcion i ON i.id_voluntario = v.id_usuario
      WHERE u.activo = 1
      GROUP BY u.id_usuario, u.nombre
      ORDER BY COUNT(i.id_inscripcion) DESC, u.nombre ASC
    `);

        const totalEventos = eventos.recordset.length;
        const totalInscritos = eventos.recordset.reduce((s, e) => s + Number(e.inscritos ?? 0), 0);
        const totalAsistieron = eventos.recordset.reduce((s, e) => s + Number(e.asistieron ?? 0), 0);
        const pctAsistencia = totalInscritos > 0 ? Math.round((totalAsistieron / totalInscritos) * 100) : 0;

        res.json({
            resumen: {
                totalEventos,
                totalInscritos,
                pctAsistencia
            },
            eventos: eventos.recordset,
            voluntarios: voluntarios.recordset
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
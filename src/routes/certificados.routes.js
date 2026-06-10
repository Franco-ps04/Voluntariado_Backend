const router = require('express').Router();
const { sql, getPool } = require('../database/db');
const auth = require('../middlewares/auth');
const soloRoles = require('../middlewares/roles');

// GET /api/certificados/mis
// Certificados del voluntario autenticado
router.get('/mis', auth, soloRoles('voluntario'), async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.usuario.id)
      .query(`
        SELECT
          c.id_certificado, c.titulo, c.motivo, c.color,
          c.cantidad_participacion,
          CONVERT(VARCHAR, c.fecha_emision, 23) AS fecha_emision,
          c.archivo_url
        FROM Certificado c
        WHERE c.id_voluntario = @id
        ORDER BY c.fecha_emision DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/certificados
// Todos los certificados (panel admin)
router.get('/', auth, soloRoles('admin'), async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`
        SELECT
          c.id_certificado, c.titulo, c.motivo, c.color,
          c.cantidad_participacion,
          CONVERT(VARCHAR, c.fecha_emision, 23) AS fecha_emision,
          u.nombre AS voluntario, u.email
        FROM Certificado c
        JOIN Usuario u ON c.id_voluntario = u.id_usuario
        ORDER BY c.fecha_emision DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/certificados/verificar/:idVoluntario
// Verificar y emitir certificados pendientes manualmente.
// Normalmente el TRIGGER lo hace automático, pero este endpoint
// es útil si necesitas forzar la verificación desde el panel.
router.post('/verificar/:idVoluntario', auth, soloRoles('admin'), async (req, res) => {
  try {
    const pool = await getPool();
    const idVol = parseInt(req.params.idVoluntario);

    // Contar asistencias confirmadas
    const asist = await pool.request()
      .input('idVol', sql.Int, idVol)
      .query(`
        SELECT COUNT(*) AS total
        FROM Asistencia a
        JOIN Inscripcion i ON a.id_inscripcion = i.id_inscripcion
        WHERE i.id_voluntario = @idVol AND a.asistio = 1
      `);

    const total = asist.recordset[0].total;

    // Obtener umbrales activos
    const configs = await pool.request()
      .query('SELECT * FROM ConfigCertificado WHERE activo = 1 ORDER BY umbral');

    const emitidos = [];
    for (const cfg of configs.recordset) {
      if (total < cfg.umbral) continue;

      // Verificar si ya tiene este certificado
      const existe = await pool.request()
        .input('idVol', sql.Int, idVol)
        .input('idCfg', sql.Int, cfg.id_config)
        .query('SELECT id_certificado FROM Certificado WHERE id_voluntario = @idVol AND id_config = @idCfg');

      if (existe.recordset.length > 0) continue;

      // Emitir certificado
      await pool.request()
        .input('titulo', sql.NVarChar, cfg.titulo)
        .input('motivo', sql.NVarChar, cfg.motivo)
        .input('color', sql.NVarChar, cfg.color)
        .input('cantidad', sql.Int, total)
        .input('idVol', sql.Int, idVol)
        .input('idCfg', sql.Int, cfg.id_config)
        .query(`INSERT INTO Certificado
                  (titulo, motivo, color, cantidad_participacion,
                   id_voluntario, id_config)
                VALUES (@titulo, @motivo, @color, @cantidad, @idVol, @idCfg)`);

      emitidos.push(cfg.titulo);
    }

    res.json({ totalAsistencias: total, emitidos });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
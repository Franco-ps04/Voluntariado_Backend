const router    = require('express').Router();
const bcrypt    = require('bcryptjs');
const { sql, getPool } = require('../database/db');
const auth      = require('../middlewares/auth');
const soloRoles = require('../middlewares/roles');

// ── GET /api/usuarios ──────────────────────────────────────
// Lista completa de usuarios (solo admin)
// Query params: ?rol=voluntario&buscar=juan
router.get('/', auth, soloRoles('admin'), async (req, res) => {
  try {
    const pool = await getPool();
    const req2 = pool.request();
    let where = 'WHERE 1=1';

    if (req.query.rol) {
      where += ' AND u.rol = @rol';
      req2.input('rol', sql.NVarChar, req.query.rol);
    }
    if (req.query.buscar) {
      where += ' AND (u.nombre LIKE @buscar OR u.email LIKE @buscar)';
      req2.input('buscar', sql.NVarChar, `%${req.query.buscar}%`);
    }

    const result = await req2.query(`
      SELECT
        u.id_usuario, u.nombre, u.email, u.telefono,
        u.rol, u.activo,
        CONVERT(VARCHAR, u.creado_en, 23) AS creado_en,
        (SELECT COUNT(*) FROM Inscripcion i
          WHERE i.id_voluntario = u.id_usuario
            AND i.estado = 'Finalizado') AS num_eventos
      FROM Usuario u
      ${where}
      ORDER BY u.creado_en DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/usuarios/:id ──────────────────────────────────
router.get('/:id', auth, soloRoles('admin'), async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`SELECT id_usuario, nombre, email, telefono, rol, activo,
                     CONVERT(VARCHAR, creado_en, 23) AS creado_en
              FROM Usuario WHERE id_usuario = @id`);

    if (!result.recordset[0])
      return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/usuarios/:id ──────────────────────────────────
// Editar datos de un usuario (sin campo distrito)
// Body: { nombre, email, telefono, rol }
router.put('/:id', auth, soloRoles('admin'), async (req, res) => {
  const { nombre, email, telefono, rol } = req.body;
  if (!nombre || !email || !telefono || !rol)
    return res.status(400).json({ message: 'Faltan campos obligatorios' });

  const rolesValidos = ['voluntario', 'admin', 'organizador'];
  if (!rolesValidos.includes(rol))
    return res.status(400).json({ message: 'Rol inválido' });

  try {
    const pool = await getPool();
    await pool.request()
      .input('id',       sql.Int,      req.params.id)
      .input('nombre',   sql.NVarChar, nombre)
      .input('email',    sql.NVarChar, email)
      .input('telefono', sql.NVarChar, telefono)
      .input('rol',      sql.NVarChar, rol)
      .query(`UPDATE Usuario
              SET nombre = @nombre, email = @email,
                  telefono = @telefono, rol = @rol
              WHERE id_usuario = @id`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PATCH /api/usuarios/:id/estado ────────────────────────
// Activar o suspender un usuario
// Body: { activo: true | false }
router.patch('/:id/estado', auth, soloRoles('admin'), async (req, res) => {
  if (typeof req.body.activo !== 'boolean')
    return res.status(400).json({ message: 'activo debe ser true o false' });

  try {
    const pool = await getPool();
    await pool.request()
      .input('id',     sql.Int, req.params.id)
      .input('activo', sql.Bit, req.body.activo ? 1 : 0)
      .query('UPDATE Usuario SET activo = @activo WHERE id_usuario = @id');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PATCH /api/usuarios/mi-perfil ─────────────────────────
// El propio voluntario edita su perfil (nombre, telefono)
router.patch('/mi-perfil', auth, async (req, res) => {
  const { nombre, telefono } = req.body;
  try {
    const pool = await getPool();
    await pool.request()
      .input('id',       sql.Int,      req.usuario.id)
      .input('nombre',   sql.NVarChar, nombre)
      .input('telefono', sql.NVarChar, telefono)
      .query('UPDATE Usuario SET nombre = @nombre, telefono = @telefono WHERE id_usuario = @id');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/usuarios/destinatarios-activos ───────────────
// Destinatarios activos para consultas/mensajes (admin y organizador)
router.get('/destinatarios-activos', auth, soloRoles('voluntario'), async (req, res) => {
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

module.exports = router;
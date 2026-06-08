const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../database/db');
const auth = require('../middlewares/auth');
const soloRoles = require('../middlewares/roles');


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

async function upsertOrganizador(pool, idUsuario, nombreOrganizacion) {
  const orgName = String(nombreOrganizacion ?? '').trim();
  if (!orgName) return;

  const exists = await pool.request()
    .input('idU', sql.Int, idUsuario)
    .query('SELECT id_organizador FROM Organizador WHERE id_usuario = @idU');

  if (exists.recordset[0]) {
    await pool.request()
      .input('idU', sql.Int, idUsuario)
      .input('org', sql.NVarChar, orgName)
      .query('UPDATE Organizador SET nombre_organizacion = @org WHERE id_usuario = @idU');
  } else {
    await pool.request()
      .input('idU', sql.Int, idUsuario)
      .input('org', sql.NVarChar, orgName)
      .query('INSERT INTO Organizador (id_usuario, nombre_organizacion) VALUES (@idU, @org)');
  }
}

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
        o.nombre_organizacion AS organizacion,
        (SELECT COUNT(*) FROM Inscripcion i
          WHERE i.id_voluntario = u.id_usuario
            AND i.estado = 'Finalizado') AS num_eventos
      FROM Usuario u
      LEFT JOIN Organizador o ON o.id_usuario = u.id_usuario
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
      .query(`SELECT u.id_usuario, u.nombre, u.email, u.telefono, u.rol, u.activo,
                     CONVERT(VARCHAR, u.creado_en, 23) AS creado_en,
                     o.nombre_organizacion AS organizacion
              FROM Usuario u
              LEFT JOIN Organizador o ON o.id_usuario = u.id_usuario
              WHERE u.id_usuario = @id`);

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
  const { nombre, email, telefono, rol, nombre_organizacion } = req.body;
  if (!nombre || !email || !telefono || !rol)
    return res.status(400).json({ message: 'Faltan campos obligatorios' });

  if (rol === 'organizador' && !String(nombre_organizacion ?? '').trim()) {
    return res.status(400).json({ message: 'La organización es obligatoria para un organizador' });
  }

  const rolesValidos = ['voluntario', 'admin', 'organizador'];
  if (!rolesValidos.includes(rol))
    return res.status(400).json({ message: 'Rol inválido' });

  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('nombre', sql.NVarChar, nombre)
      .input('email', sql.NVarChar, email)
      .input('telefono', sql.NVarChar, telefono)
      .input('rol', sql.NVarChar, rol)
      .query(`UPDATE Usuario
              SET nombre = @nombre, email = @email,
                  telefono = @telefono, rol = @rol
              WHERE id_usuario = @id`);

    if (rol === 'organizador') {
      await upsertOrganizador(pool, req.params.id, nombre_organizacion);
    } else {
      await pool.request()
        .input('idU', sql.Int, req.params.id)
        .query('DELETE FROM Organizador WHERE id_usuario = @idU');
    }

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
      .input('id', sql.Int, req.params.id)
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
      .input('id', sql.Int, req.usuario.id)
      .input('nombre', sql.NVarChar, nombre)
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
          u.rol,
          o.nombre_organizacion
        FROM Usuario u
        LEFT JOIN Organizador o ON o.id_usuario = u.id_usuario
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
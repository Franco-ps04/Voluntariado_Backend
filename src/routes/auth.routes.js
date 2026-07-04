const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql, getPool } = require('../database/db');
const auth = require('../middlewares/auth');

function soloDigitos(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function validarPassword(password) {
  const raw = String(password ?? '');
  return raw.length >= 8 && /[A-Za-z]/.test(raw) && /\d/.test(raw);
}


// POST /api/auth/login
// Body: { email, password }
// Responde: { id, nombre, email, rol, token }
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email y contraseña requeridos' });

  try {
    const pool = await getPool();

    const result = await pool.request()
      .input('email', sql.NVarChar, email)
      .query(`SELECT id_usuario, nombre, email, contrasena, rol, activo
              FROM Usuario
              WHERE email = @email`);

    const user = result.recordset[0];
    if (!user)
      return res.status(401).json({ message: 'Credenciales inválidas' });

    if (!user.activo)
      return res.status(403).json({ message: 'Cuenta suspendida' });

    // Verificar contraseña con bcrypt
    const ok = await bcrypt.compare(password, user.contrasena);
    if (!ok)
      return res.status(401).json({ message: 'Credenciales inválidas' });

    // Crear token JWT
    const token = jwt.sign(
      {
        id: user.id_usuario,
        email: user.email,
        rol: user.rol,
        nombre: user.nombre
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES }
    );

    res.json({
      id: user.id_usuario,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      token
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

//POST /api/auth/register
// Body: { nombre, email, password, telefono }
router.post('/register', async (req, res) => {
  const { nombre, email, password, telefono } = req.body;
  if (!nombre || !email || !password || !telefono)
    return res.status(400).json({ message: 'Todos los campos son requeridos' });

  try {
    const pool = await getPool();

    // Verificar si el email ya existe
    const existe = await pool.request()
      .input('email', sql.NVarChar, email)
      .query('SELECT id_usuario FROM Usuario WHERE email = @email');

    if (existe.recordset.length > 0)
      return res.status(409).json({ message: 'El correo ya está registrado' });

    // Encriptar contraseña
    const hash = await bcrypt.hash(password, 10);

    // Insertar Usuario y obtener el ID generado
    const ins = await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('email', sql.NVarChar, email)
      .input('hash', sql.NVarChar, hash)
      .input('telefono', sql.NVarChar, telefono)
      .query(`DECLARE @Ids TABLE (id_usuario INT);

              INSERT INTO Usuario (nombre, email, contrasena, telefono, rol)
              OUTPUT INSERTED.id_usuario INTO @Ids
              VALUES (@nombre, @email, @hash, @telefono, 'voluntario');

              SELECT TOP 1 id_usuario FROM @Ids;`);

    const newId = ins.recordset[0].id_usuario;

    // Registrar en tabla Voluntario
    await pool.request()
      .input('id', sql.Int, newId)
      .query('INSERT INTO Voluntario (id_usuario) VALUES (@id)');

    // Generar token
    const token = jwt.sign(
      { id: newId, email, rol: 'voluntario', nombre },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES }
    );

    res.status(201).json({ id: newId, nombre, email, rol: 'voluntario', token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/recuperar-contrasena
// Body: { email, telefono, nuevaContrasena }
router.post('/recuperar-contrasena', async (req, res) => {
  const email = String(req.body.email ?? '').trim();
  const telefono = soloDigitos(req.body.telefono);
  const nuevaContrasena = String(req.body.nuevaContrasena ?? '');

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Ingresa un correo válido' });
  }
  if (!telefono || telefono.length !== 9) {
    return res.status(400).json({ message: 'Ingresa un teléfono válido de 9 dígitos' });
  }
  if (!nuevaContrasena || !validarPassword(nuevaContrasena)) {
    return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 8 caracteres, una letra y un número' });
  }

  try {
    const pool = await getPool();

    const result = await pool.request()
      .input('email', sql.NVarChar, email)
      .input('telefono', sql.NVarChar, telefono)
      .query(`
        SELECT id_usuario, activo
        FROM Usuario
        WHERE email = @email AND telefono = @telefono
      `);

    const user = result.recordset[0];
    if (!user) {
      return res.status(404).json({ message: 'No encontramos una cuenta con esos datos' });
    }

    if (!user.activo) {
      return res.status(403).json({ message: 'La cuenta está suspendida' });
    }

    const hash = await bcrypt.hash(nuevaContrasena, 10);

    await pool.request()
      .input('id', sql.Int, user.id_usuario)
      .input('hash', sql.NVarChar, hash)
      .query('UPDATE Usuario SET contrasena = @hash WHERE id_usuario = @id');

    return res.json({ ok: true, message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'No se pudo actualizar la contraseña' });
  }
});

//GET /api/auth/me
// Perfil del usuario autenticado (lee el JWT)
router.get('/me', auth, (req, res) => {
  res.json(req.usuario);
});

module.exports = router;
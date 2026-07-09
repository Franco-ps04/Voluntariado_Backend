const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const usuarioDAO = require('../dao/UsuarioDAO');
const { soloDigitos, validarEmail, validarPassword } = require('../utils/validators');

// POST /api/auth/login
// Body: { email, password }
async function login(req, res) {
  const email = String(req.body.email ?? '').trim();
  const password = String(req.body.password ?? '');

  if (!email || !validarEmail(email)) {
    return res.status(400).json({ message: 'Ingresa un correo electrónico válido' });
  }
  if (!password) {
    return res.status(400).json({ message: 'Ingresa tu contraseña' });
  }

  try {
    const user = await usuarioDAO.findByEmail(email);
    if (!user)
      return res.status(401).json({ message: 'Credenciales inválidas' });

    if (!user.activo)
      return res.status(403).json({ message: 'Cuenta suspendida' });

    const ok = await bcrypt.compare(password, user.contrasena);
    if (!ok)
      return res.status(401).json({ message: 'Credenciales inválidas' });

    const token = jwt.sign(
      { id: user.id_usuario, email: user.email, rol: user.rol, nombre: user.nombre },
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
}

// POST /api/auth/register
// Body: { nombre, email, password, telefono }
async function register(req, res) {
  const nombre = String(req.body.nombre ?? '').trim();
  const email = String(req.body.email ?? '').trim();
  const password = String(req.body.password ?? '');
  const telefono = soloDigitos(req.body.telefono);

  if (!nombre || nombre.length < 3) {
    return res.status(400).json({ message: 'El nombre debe tener al menos 3 caracteres' });
  }
  if (!email || !validarEmail(email)) {
    return res.status(400).json({ message: 'Ingresa un correo válido' });
  }
  if (!password || !validarPassword(password)) {
    return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres, una letra y un número' });
  }
  if (!telefono || telefono.length !== 9) {
    return res.status(400).json({ message: 'El teléfono debe tener 9 dígitos' });
  }

  try {
    const existe = await usuarioDAO.findByEmail(email);
    if (existe)
      return res.status(409).json({ message: 'El correo ya está registrado' });

    const hash = await bcrypt.hash(password, 10);
    const newId = await usuarioDAO.crearUsuario({ nombre, email, hash, telefono, rol: 'voluntario' });
    await usuarioDAO.crearVoluntario(newId);

    const token = jwt.sign(
      { id: newId, email, rol: 'voluntario', nombre },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES }
    );

    res.status(201).json({ id: newId, nombre, email, rol: 'voluntario', token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// POST /api/auth/recuperar-contrasena
// Body: { email, telefono, nuevaContrasena }
async function recuperarContrasena(req, res) {
  const email = String(req.body.email ?? '').trim();
  const telefono = soloDigitos(req.body.telefono);
  const nuevaContrasena = String(req.body.nuevaContrasena ?? '');

  if (!email || !validarEmail(email)) {
    return res.status(400).json({ message: 'Ingresa un correo válido' });
  }
  if (!telefono || telefono.length !== 9) {
    return res.status(400).json({ message: 'Ingresa un teléfono válido de 9 dígitos' });
  }
  if (!nuevaContrasena || !validarPassword(nuevaContrasena)) {
    return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 8 caracteres, una letra y un número' });
  }

  try {
    const user = await usuarioDAO.findByEmailAndTelefono(email, telefono);
    if (!user) {
      return res.status(404).json({ message: 'No encontramos una cuenta con esos datos' });
    }
    if (!user.activo) {
      return res.status(403).json({ message: 'La cuenta está suspendida' });
    }

    const hash = await bcrypt.hash(nuevaContrasena, 10);
    await usuarioDAO.actualizarPassword(user.id_usuario, hash);

    return res.json({ ok: true, message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'No se pudo actualizar la contraseña' });
  }
}

// GET /api/auth/me
function me(req, res) {
  res.json(req.usuario);
}

module.exports = { login, register, recuperarContrasena, me };

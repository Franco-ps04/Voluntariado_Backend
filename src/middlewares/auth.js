const jwt = require('jsonwebtoken');
require('dotenv').config();

// Se ejecuta ANTES de cada ruta protegida.
// Verifica que el token JWT enviado por Angular sea válido.
function verificarToken(req, res, next) {
  // Angular envía: Authorization: Bearer eyJhbGci...
  const header = req.headers['authorization'];
  if (!header)
    return res.status(401).json({ message: 'Token requerido' });

  const token = header.split(' ')[1]; // quitar "Bearer "
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded; // { id, email, rol, nombre }
    next();                // continuar al endpoint
  } catch {
    res.status(401).json({ message: 'Token inválido o expirado' });
  }
}

module.exports = verificarToken;
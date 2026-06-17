const jwt = require('jsonwebtoken');
const { sql, getPool } = require('../database/db');
require('dotenv').config();

// Se ejecuta ANTES de cada ruta protegida.
// Verifica que el token JWT enviado por Angular sea válido.
async function verificarToken(req, res, next) {
  const header = req.headers['authorization'];
  if (!header)
    return res.status(401).json({ message: 'Token requerido' });

  const token = header.split(' ')[1]; // quitar "Bearer "
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, decoded.id)
      .query(`
        SELECT id_usuario, activo
        FROM Usuario
        WHERE id_usuario = @id
      `);

    const user = result.recordset[0];
    if (!user) {
      return res.status(401).json({ message: 'Token inválido o expirado' });
    }

    if (!user.activo) {
      return res.status(403).json({ message: 'Cuenta suspendida' });
    }

    req.usuario = decoded; // { id, email, rol, nombre }
    next(); // continuar al endpoint
  } catch {
    res.status(401).json({ message: 'Token inválido o expirado' });
  }
}

module.exports = verificarToken;
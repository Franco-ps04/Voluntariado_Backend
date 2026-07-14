const { query } = require('../config/db');
const BaseDAO = require('./BaseDAO');

/**
 * UsuarioDAO
 * Acceso a datos de Usuario / Voluntario / Administrador.
 * Ninguna de estas funciones valida entradas de negocio: eso vive en los
 * controladores. Aquí solo hay SQL parametrizado.
 */
class UsuarioDAO extends BaseDAO {
  constructor() {
    super('Usuario', 'id_usuario');
  }

  async findByEmail(email) {
    const { rows } = await query(
      `SELECT id_usuario, nombre, email, contrasena, rol, activo
       FROM Usuario
       WHERE email = $1`,
      [email]
    );
    return rows[0] || null;
  }

  async findByEmailAndTelefono(email, telefono) {
    const { rows } = await query(
      `SELECT id_usuario, activo
       FROM Usuario
       WHERE email = $1 AND telefono = $2`,
      [email, telefono]
    );
    return rows[0] || null;
  }

  async findAuthById(id) {
    const { rows } = await query(
      `SELECT id_usuario, activo FROM Usuario WHERE id_usuario = $1`,
      [id]
    );
    return rows[0] || null;
  }

  async crearUsuario({ nombre, email, hash, telefono, rol = 'voluntario' }) {
    const { rows } = await query(
      `INSERT INTO Usuario (nombre, email, contrasena, telefono, rol)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id_usuario`,
      [nombre, email, hash, telefono, rol]
    );
    return rows[0].id_usuario;
  }

  async crearVoluntario(idUsuario) {
    await query('INSERT INTO Voluntario (id_usuario) VALUES ($1)', [idUsuario]);
  }

  async actualizarPassword(idUsuario, hash) {
    await query('UPDATE Usuario SET contrasena = $1 WHERE id_usuario = $2', [hash, idUsuario]);
  }

  async listar({ rol, buscar } = {}) {
    const condiciones = ['1 = 1'];
    const params = [];

    if (rol) {
      params.push(rol);
      condiciones.push(`u.rol = $${params.length}`);
    }
    if (buscar) {
      params.push(`%${buscar}%`);
      condiciones.push(`(u.nombre ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }

    const { rows } = await query(
      `SELECT
         u.id_usuario, u.nombre, u.email, u.telefono,
         u.rol, u.activo,
         TO_CHAR(u.creado_en, 'YYYY-MM-DD') AS creado_en,
         o.nombre_organizacion AS organizacion,
         (SELECT COUNT(*)::int FROM Inscripcion i
           WHERE i.id_voluntario = u.id_usuario
             AND i.estado = 'Finalizado') AS num_eventos
       FROM Usuario u
       LEFT JOIN Organizador o ON o.id_usuario = u.id_usuario
       WHERE ${condiciones.join(' AND ')}
       ORDER BY u.creado_en DESC`,
      params
    );
    return rows;
  }

  async findDestinatariosActivos() {
    const { rows } = await query(
      `SELECT
         u.id_usuario, u.nombre, u.email, u.rol,
         o.nombre_organizacion
       FROM Usuario u
       LEFT JOIN Organizador o ON o.id_usuario = u.id_usuario
       WHERE u.activo = true
         AND u.rol = 'admin'
       ORDER BY u.nombre ASC`
    );
    return rows;
  }

  async findConOrganizacion(id) {
    const { rows } = await query(
      `SELECT u.id_usuario, u.nombre, u.email, u.telefono, u.rol, u.activo,
              TO_CHAR(u.creado_en, 'YYYY-MM-DD') AS creado_en,
              o.nombre_organizacion AS organizacion
       FROM Usuario u
       LEFT JOIN Organizador o ON o.id_usuario = u.id_usuario
       WHERE u.id_usuario = $1`,
      [id]
    );
    return rows[0] || null;
  }

  async actualizar(id, { nombre, email, telefono, rol }) {
    await query(
      `UPDATE Usuario
       SET nombre = $1, email = $2, telefono = $3, rol = $4
       WHERE id_usuario = $5`,
      [nombre, email, telefono, rol, id]
    );
  }

  async actualizarEstado(id, activo) {
    await query('UPDATE Usuario SET activo = $1 WHERE id_usuario = $2', [Boolean(activo), id]);
  }

  async actualizarPerfil(id, { nombre, telefono }) {
    await query(
      'UPDATE Usuario SET nombre = $1, telefono = $2 WHERE id_usuario = $3',
      [nombre, telefono, id]
    );
  }

  async findRolById(id) {
    const { rows } = await query('SELECT rol FROM Usuario WHERE id_usuario = $1', [id]);
    return rows[0]?.rol ?? null;
  }

  async findEstadoYRolById(id) {
    const { rows } = await query('SELECT rol, activo FROM Usuario WHERE id_usuario = $1', [id]);
    return rows[0] || null;
  }

  // Cuántos administradores activos (no suspendidos) hay en el sistema.
  // Se usa para impedir que una acción deje el sistema sin ningún admin.
  async contarAdminsActivos() {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS total FROM Usuario WHERE rol = 'admin' AND activo = true`
    );
    return rows[0]?.total ?? 0;
  }
}

module.exports = new UsuarioDAO();
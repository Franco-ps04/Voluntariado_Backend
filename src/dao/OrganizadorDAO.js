const { query } = require('../config/db');
const BaseDAO = require('./BaseDAO');

class OrganizadorDAO extends BaseDAO {
  constructor() {
    super('Organizador', 'id_organizador');
  }

  async findByUsuarioId(idUsuario) {
    const { rows } = await query(
      `SELECT id_organizador, nombre_organizacion
       FROM Organizador
       WHERE id_usuario = $1`,
      [idUsuario]
    );
    return rows[0] || null;
  }

  async crear(idUsuario, nombreOrganizacion) {
    const { rows } = await query(
      `INSERT INTO Organizador (id_usuario, nombre_organizacion)
       VALUES ($1, $2)
       RETURNING id_organizador`,
      [idUsuario, nombreOrganizacion]
    );
    return rows[0].id_organizador;
  }

  async actualizarNombre(idUsuario, nombreOrganizacion) {
    await query(
      'UPDATE Organizador SET nombre_organizacion = $1 WHERE id_usuario = $2',
      [nombreOrganizacion, idUsuario]
    );
  }

  async upsert(idUsuario, nombreOrganizacion) {
    const orgName = String(nombreOrganizacion ?? '').trim();
    if (!orgName) return;

    const existente = await this.findByUsuarioId(idUsuario);
    if (existente) {
      await this.actualizarNombre(idUsuario, orgName);
    } else {
      await this.crear(idUsuario, orgName);
    }
  }

  async eliminarPorUsuario(idUsuario) {
    await query('DELETE FROM Organizador WHERE id_usuario = $1', [idUsuario]);
  }

  async findByIdExiste(idOrganizador) {
    const { rows } = await query(
      'SELECT id_organizador FROM Organizador WHERE id_organizador = $1',
      [idOrganizador]
    );
    return rows.length > 0;
  }

  async listarActivos() {
    const { rows } = await query(
      `SELECT
         o.id_organizador, o.id_usuario, u.nombre, u.email,
         o.nombre_organizacion
       FROM Organizador o
       INNER JOIN Usuario u ON o.id_usuario = u.id_usuario
       WHERE u.activo = true
       ORDER BY u.nombre ASC`
    );
    return rows;
  }
}

module.exports = new OrganizadorDAO();

const { query } = require('../config/db');
const BaseDAO = require('./BaseDAO');

class CertificadoDAO extends BaseDAO {
  constructor() {
    super('Certificado', 'id_certificado');
  }

  async misCertificados(idVoluntario) {
    const { rows } = await query(
      `SELECT
         c.id_certificado, c.titulo, c.motivo, c.color,
         c.cantidad_participacion,
         TO_CHAR(c.fecha_emision, 'YYYY-MM-DD') AS fecha_emision,
         c.archivo_url
       FROM Certificado c
       WHERE c.id_voluntario = $1
       ORDER BY c.fecha_emision DESC`,
      [idVoluntario]
    );
    return rows;
  }

  async listarTodos() {
    const { rows } = await query(
      `SELECT
         c.id_certificado, c.titulo, c.motivo, c.color,
         c.cantidad_participacion,
         TO_CHAR(c.fecha_emision, 'YYYY-MM-DD') AS fecha_emision,
         u.nombre AS voluntario, u.email
       FROM Certificado c
       JOIN Usuario u ON c.id_voluntario = u.id_usuario
       ORDER BY c.fecha_emision DESC`
    );
    return rows;
  }

  async listarConfigsActivos() {
    const { rows } = await query(
      'SELECT * FROM ConfigCertificado WHERE activo = true ORDER BY umbral'
    );
    return rows;
  }

  async existeParaVoluntarioYConfig(idVoluntario, idConfig) {
    const { rows } = await query(
      'SELECT id_certificado FROM Certificado WHERE id_voluntario = $1 AND id_config = $2',
      [idVoluntario, idConfig]
    );
    return rows.length > 0;
  }

  async emitir({ titulo, motivo, color, cantidad, idVoluntario, idConfig }) {
    await query(
      `INSERT INTO Certificado
         (titulo, motivo, color, cantidad_participacion, id_voluntario, id_config)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [titulo, motivo, color, cantidad, idVoluntario, idConfig]
    );
  }
}

module.exports = new CertificadoDAO();

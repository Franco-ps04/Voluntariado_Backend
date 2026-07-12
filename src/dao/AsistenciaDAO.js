const { query } = require('../config/db');
const BaseDAO = require('./BaseDAO');

class AsistenciaDAO extends BaseDAO {
  constructor() {
    super('Asistencia', 'id_asistencia');
  }

  async findByEventoDetallado(idEvento) {
    const { rows } = await query(
      `SELECT
         i.id_inscripcion,
         u.id_usuario, u.nombre, u.email, u.telefono,
         a.id_asistencia, a.asistio,
         TO_CHAR(a.fecha_registro, 'YYYY-MM-DD HH24:MI:SS') AS fecha_registro
       FROM Inscripcion  i
       JOIN Usuario      u ON i.id_voluntario     = u.id_usuario
       LEFT JOIN Asistencia a ON i.id_inscripcion = a.id_inscripcion
       WHERE i.id_evento = $1
         AND i.estado != 'Cancelado'
       ORDER BY u.nombre`,
      [idEvento]
    );
    return rows;
  }

  async findByInscripcion(idInscripcion) {
    const { rows } = await query(
      'SELECT id_asistencia FROM Asistencia WHERE id_inscripcion = $1',
      [idInscripcion]
    );
    return rows[0] || null;
  }

  async crear(idInscripcion, asistio) {
    await query(
      'INSERT INTO Asistencia (id_inscripcion, asistio) VALUES ($1, $2)',
      [idInscripcion, Boolean(asistio)]
    );
  }

  async actualizar(idInscripcion, asistio) {
    // El TRIGGER TR_Asistencia_Certificado se dispara aquí si asistio pasa a true
    await query(
      `UPDATE Asistencia
       SET asistio = $1, fecha_registro = NOW()
       WHERE id_inscripcion = $2`,
      [Boolean(asistio), idInscripcion]
    );
  }

  async countConfirmadasPorVoluntario(idVoluntario) {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS total
       FROM Asistencia a
       JOIN Inscripcion i ON a.id_inscripcion = i.id_inscripcion
       WHERE i.id_voluntario = $1 AND a.asistio = true`,
      [idVoluntario]
    );
    return Number(rows[0]?.total ?? 0);
  }

  async eliminarPorInscripcion(idInscripcion) {
    await query('DELETE FROM Asistencia WHERE id_inscripcion = $1', [idInscripcion]);
  }

  async eliminarPorVoluntario(idVoluntario) {
    await query(
      `DELETE FROM Asistencia
       WHERE id_inscripcion IN (
         SELECT id_inscripcion FROM Inscripcion WHERE id_voluntario = $1
       )`,
      [idVoluntario]
    );
  }

  async eliminarPorEvento(idEvento) {
    await query(
      `DELETE FROM Asistencia a
       USING Inscripcion i
       WHERE a.id_inscripcion = i.id_inscripcion
         AND i.id_evento = $1`,
      [idEvento]
    );
  }
}

module.exports = new AsistenciaDAO();
const { query } = require('../config/db');
const BaseDAO = require('./BaseDAO');

class InscripcionDAO extends BaseDAO {
  constructor() {
    super('Inscripcion', 'id_inscripcion');
  }

  async misInscripciones(idVoluntario) {
    const { rows } = await query(
      `SELECT
         i.id_inscripcion, TO_CHAR(i.fecha_inscripcion, 'YYYY-MM-DD') AS fecha_inscripcion, i.estado,
         e.id_evento, e.nombre AS titulo, e.descripcion,
         TO_CHAR(e.fecha, 'YYYY-MM-DD') AS fecha,
         TO_CHAR(e.hora, 'HH24:MI:SS') AS hora,
         e.ubicacion, e.capacidad, e.inscritos,
         e.latitud, e.longitud, e.imagen_url,
         t.nombre AS tipo,
         u.nombre AS organizador,
         u.id_usuario AS id_usuario_organizador,
         u.email AS email_organizador,
         a.asistio
       FROM Inscripcion i
       JOIN Evento      e ON i.id_evento    = e.id_evento
       JOIN TipoEvento  t ON e.id_tipo      = t.id_tipo
       JOIN Organizador o ON e.id_organizador = o.id_organizador
       JOIN Usuario     u ON o.id_usuario   = u.id_usuario
       LEFT JOIN Asistencia a ON i.id_inscripcion = a.id_inscripcion
       WHERE i.id_voluntario = $1
         AND COALESCE(e.archivado, false) = false
       ORDER BY e.fecha DESC`,
      [idVoluntario]
    );
    return rows;
  }

  async inscritosDeEvento(idEvento) {
    const { rows } = await query(
      `SELECT
         i.id_inscripcion, TO_CHAR(i.fecha_inscripcion, 'YYYY-MM-DD') AS fecha_inscripcion, i.estado,
         u.id_usuario, u.nombre, u.email, u.telefono,
         a.id_asistencia, a.asistio
       FROM Inscripcion  i
       JOIN Evento       e ON i.id_evento      = e.id_evento
       JOIN Usuario      u ON i.id_voluntario  = u.id_usuario
       LEFT JOIN Asistencia a ON i.id_inscripcion = a.id_inscripcion
       WHERE i.id_evento = $1
         AND COALESCE(e.archivado, false) = false
       ORDER BY u.nombre`,
      [idEvento]
    );
    return rows;
  }

  async findByVoluntarioYEvento(idVoluntario, idEvento) {
    const { rows } = await query(
      `SELECT id_inscripcion, estado
       FROM Inscripcion
       WHERE id_voluntario = $1 AND id_evento = $2`,
      [idVoluntario, idEvento]
    );
    return rows[0] || null;
  }

  async findDisponibilidadEvento(idEvento) {
    const { rows } = await query(
      `SELECT capacidad, inscritos, estado
       FROM Evento
       WHERE id_evento = $1 AND COALESCE(archivado, false) = false`,
      [idEvento]
    );
    return rows[0] || null;
  }

  async reactivar(idInscripcion) {
    await query(`UPDATE Inscripcion SET estado = 'Próximo' WHERE id_inscripcion = $1`, [idInscripcion]);
  }

  async crear(idVoluntario, idEvento) {
    const { rows } = await query(
      `INSERT INTO Inscripcion (id_voluntario, id_evento)
       VALUES ($1, $2)
       RETURNING id_inscripcion`,
      [idVoluntario, idEvento]
    );
    return rows[0].id_inscripcion;
  }

  async incrementarInscritos(idEvento) {
    await query(
      `UPDATE Evento
       SET inscritos = CASE WHEN inscritos < capacidad THEN inscritos + 1 ELSE inscritos END
       WHERE id_evento = $1`,
      [idEvento]
    );
  }

  async findByIdYVoluntario(idInscripcion, idVoluntario) {
    const { rows } = await query(
      `SELECT id_inscripcion, estado FROM Inscripcion
       WHERE id_inscripcion = $1 AND id_voluntario = $2`,
      [idInscripcion, idVoluntario]
    );
    return rows[0] || null;
  }

  async cancelar(idInscripcion) {
    await query(`UPDATE Inscripcion SET estado = 'Cancelado' WHERE id_inscripcion = $1`, [idInscripcion]);
  }

  async marcarFinalizada(idInscripcion) {
    await query(`UPDATE Inscripcion SET estado = 'Finalizado' WHERE id_inscripcion = $1`, [idInscripcion]);
  }

  async findVoluntarioByInscripcion(idInscripcion) {
    const { rows } = await query(
      'SELECT id_voluntario FROM Inscripcion WHERE id_inscripcion = $1',
      [idInscripcion]
    );
    return rows[0]?.id_voluntario ?? null;
  }

  async decrementarInscritosPorInscripcion(idInscripcion) {
    await query(
      `UPDATE Evento e
       SET inscritos = CASE WHEN e.inscritos > 0 THEN e.inscritos - 1 ELSE 0 END
       FROM Inscripcion i
       WHERE i.id_evento = e.id_evento
         AND i.id_inscripcion = $1`,
      [idInscripcion]
    );
  }

  // Al suspender a un voluntario: elimina sus inscripciones a eventos aún no
  // finalizados/cancelados (conservando el historial de eventos ya
  // finalizados) y descuenta el contador `inscritos` de cada evento afectado
  // en una sola sentencia (CTE con DELETE...RETURNING + UPDATE...FROM).
  async eliminarActivasPorVoluntarioConAjusteInscritos(idVoluntario) {
    await query(
      `WITH eliminados AS (
         DELETE FROM Inscripcion i
         USING Evento e
         WHERE i.id_evento = e.id_evento
           AND i.id_voluntario = $1
           AND COALESCE(e.archivado, false) = false
           AND e.estado IN ('Próximo', 'En curso')
         RETURNING i.id_evento
       ),
       conteo AS (
         SELECT id_evento, COUNT(*) AS cnt FROM eliminados GROUP BY id_evento
       )
       UPDATE Evento e
       SET inscritos = CASE WHEN e.inscritos > c.cnt THEN e.inscritos - c.cnt ELSE 0 END
       FROM conteo c
       WHERE e.id_evento = c.id_evento`,
      [idVoluntario]
    );
  }

  async eliminarPorEvento(idEvento) {
    await query('DELETE FROM Inscripcion WHERE id_evento = $1', [idEvento]);
  }

  // Al promover un voluntario a admin/organizador: cancela (no elimina) sus
  // inscripciones activas para conservar el historial. El TRIGGER
  // TR_Inscripcion_Count recalcula Evento.inscritos automáticamente.
  async cancelarTodasActivasPorVoluntario(idVoluntario) {
    await query(
      `UPDATE Inscripcion
       SET estado = 'Cancelado'
       WHERE id_voluntario = $1 AND estado <> 'Cancelado'`,
      [idVoluntario]
    );
  }
}

module.exports = new InscripcionDAO();

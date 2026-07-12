const { query } = require('../config/db');
const BaseDAO = require('./BaseDAO');

class NotificacionDAO extends BaseDAO {
  constructor() {
    super('Notificacion', 'id_notificacion');
  }

  async misNotificaciones(idVoluntario) {
    const { rows } = await query(
      `SELECT
         n.id_notificacion, n.titulo, n.mensaje,
         TO_CHAR(n.fecha, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS fecha,
         e.nombre  AS evento,
         e.estado  AS estado_evento,
         u.nombre  AS enviado_por,
         CASE WHEN nl.id_notificacion IS NOT NULL THEN 1 ELSE 0 END AS leida
       FROM Notificacion n
       JOIN Evento    e  ON n.id_evento = e.id_evento
       JOIN Usuario   u  ON n.id_usuario = u.id_usuario
       JOIN Inscripcion i ON i.id_evento  = e.id_evento
                         AND i.id_voluntario = $1
                         AND i.estado != 'Cancelado'
       LEFT JOIN NotificacionLeida nl
              ON nl.id_notificacion = n.id_notificacion
             AND nl.id_voluntario   = $1
       ORDER BY n.fecha DESC`,
      [idVoluntario]
    );
    return rows;
  }

  async marcarLeida(idNotificacion, idVoluntario) {
    await query(
      `INSERT INTO NotificacionLeida (id_notificacion, id_voluntario)
       VALUES ($1, $2)
       ON CONFLICT (id_notificacion, id_voluntario) DO NOTHING`,
      [idNotificacion, idVoluntario]
    );
  }

  async findEventoParaNotificacion(idEvento) {
    const { rows } = await query(
      `SELECT e.id_evento, e.estado
       FROM Evento e
       WHERE e.id_evento = $1
         AND COALESCE(e.archivado, false) = false`,
      [idEvento]
    );
    return rows[0] || null;
  }

  async crear({ titulo, mensaje, idUsuario, idEvento }) {
    const { rows } = await query(
      `INSERT INTO Notificacion (titulo, mensaje, id_usuario, id_evento)
       VALUES ($1, $2, $3, $4)
       RETURNING id_notificacion`,
      [titulo, mensaje, idUsuario, idEvento]
    );
    return rows[0].id_notificacion;
  }

  async listarEnviadasPor(idUsuario) {
    const { rows } = await query(
      `SELECT n.id_notificacion, n.titulo, n.mensaje,
              TO_CHAR(n.fecha, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS fecha,
              e.nombre AS evento
       FROM Notificacion n
       JOIN Evento e ON n.id_evento = e.id_evento
       WHERE n.id_usuario = $1
       ORDER BY n.fecha DESC`,
      [idUsuario]
    );
    return rows;
  }

  async eliminarPorEvento(idEvento) {
    await query('DELETE FROM Notificacion WHERE id_evento = $1', [idEvento]);
  }
}

module.exports = new NotificacionDAO();

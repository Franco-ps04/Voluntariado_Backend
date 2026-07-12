const { query } = require('../config/db');

class ReporteDAO {
  async resumenEventos() {
    const { rows } = await query(
      `SELECT
         e.id_evento,
         e.nombre,
         e.descripcion,
         TO_CHAR(e.fecha, 'YYYY-MM-DD') AS fecha,
         TO_CHAR(e.hora, 'HH24:MI:SS') AS hora,
         e.ubicacion,
         e.capacidad,
         e.inscritos,
         e.estado,
         e.latitud,
         e.longitud,
         e.imagen_url,
         t.nombre AS tipo,
         u.nombre AS organizador,
         o.nombre_organizacion AS organizacion,
         COALESCE(asist.asistieron, 0) AS "asistieron",
         COALESCE(asist."noAsistieron", 0) AS "noAsistieron"
       FROM Evento e
       INNER JOIN TipoEvento t ON e.id_tipo = t.id_tipo
       INNER JOIN Organizador o ON e.id_organizador = o.id_organizador
       INNER JOIN Usuario u ON o.id_usuario = u.id_usuario
       LEFT JOIN (
         SELECT
           i.id_evento,
           SUM(CASE WHEN a.asistio = true THEN 1 ELSE 0 END)::int AS asistieron,
           SUM(CASE WHEN a.asistio = false THEN 1 ELSE 0 END)::int AS "noAsistieron"
         FROM Inscripcion i
         LEFT JOIN Asistencia a ON a.id_inscripcion = i.id_inscripcion
         GROUP BY i.id_evento
       ) asist ON asist.id_evento = e.id_evento
       ORDER BY e.fecha DESC, e.hora DESC, e.id_evento DESC`
    );
    return rows;
  }

  async topVoluntarios() {
    const { rows } = await query(
      `SELECT
         u.id_usuario,
         u.nombre,
         COUNT(i.id_inscripcion)::int AS eventos
       FROM Usuario u
       LEFT JOIN Inscripcion i ON i.id_voluntario = u.id_usuario
       WHERE u.activo = true AND u.rol = 'voluntario'
       GROUP BY u.id_usuario, u.nombre
       ORDER BY COUNT(i.id_inscripcion) DESC, u.nombre ASC
       LIMIT 10`
    );
    return rows;
  }
}

module.exports = new ReporteDAO();

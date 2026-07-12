const { query } = require('../config/db');
const BaseDAO = require('./BaseDAO');

const CAMPOS_MENSAJE = `
  m.id_mensaje,
  m.asunto,
  m.mensaje,
  TO_CHAR(m.fecha, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS fecha,
  m.leido,
  m.leido_por_voluntario,
  m.respondido,
  m.id_voluntario AS "idRemitente",
  m.id_usuario_destino AS "idDestinatario",
  u.nombre AS remitente,
  u.email AS "emailRemitente",
  u2.nombre AS destinatario,
  u2.rol AS "rolDestinatario",
  e.nombre AS "eventoRelacionado"
`;

class MensajeDAO extends BaseDAO {
  constructor() {
    super('Mensaje', 'id_mensaje');
  }

  async getHistorial(idMensaje) {
    const { rows } = await query(
      `SELECT
         r.id_respuesta,
         r.texto,
         TO_CHAR(r.fecha, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS fecha,
         u.nombre AS respondido_por,
         u.rol AS rol_usuario,
         CASE WHEN u.rol = 'voluntario' THEN 'voluntario' ELSE 'admin' END AS tipo
       FROM RespuestaMensaje r
       INNER JOIN Usuario u ON r.id_usuario = u.id_usuario
       WHERE r.id_mensaje = $1
       ORDER BY r.fecha ASC, r.id_respuesta ASC`,
      [idMensaje]
    );
    return rows;
  }

  async obtenerMensajeBase(idMensaje) {
    const { rows } = await query(
      `SELECT
         m.id_mensaje, m.asunto, m.mensaje,
         TO_CHAR(m.fecha, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS fecha,
         m.leido, m.leido_por_voluntario, m.respondido,
         m.id_voluntario AS "idRemitente",
         m.id_usuario_destino AS "idDestinatario",
         u1.nombre AS remitente, u1.email AS "emailRemitente",
         u2.nombre AS destinatario, u2.email AS "emailDestinatario",
         u2.rol AS "rolDestinatario",
         e.nombre AS "eventoRelacionado"
       FROM Mensaje m
       INNER JOIN Usuario u1 ON m.id_voluntario = u1.id_usuario
       INNER JOIN Usuario u2 ON m.id_usuario_destino = u2.id_usuario
       LEFT JOIN Evento e ON m.id_evento = e.id_evento
       WHERE m.id_mensaje = $1
       LIMIT 1`,
      [idMensaje]
    );
    return rows[0] || null;
  }

  async destinatariosParaVoluntario() {
    const { rows } = await query(
      `SELECT u.id_usuario, u.nombre, u.email, u.rol
       FROM Usuario u
       WHERE u.activo = true AND u.rol = 'admin'
       ORDER BY u.nombre ASC`
    );
    return rows;
  }

  async misMensajes(idVoluntario) {
    const { rows } = await query(
      `SELECT ${CAMPOS_MENSAJE}
       FROM Mensaje m
       INNER JOIN Usuario u ON m.id_voluntario = u.id_usuario
       INNER JOIN Usuario u2 ON m.id_usuario_destino = u2.id_usuario
       LEFT JOIN Evento e ON m.id_evento = e.id_evento
       WHERE m.id_voluntario = $1
       ORDER BY m.fecha DESC, m.id_mensaje DESC`,
      [idVoluntario]
    );
    return rows;
  }

  async panelDestinatario(idUsuarioDestino) {
    const { rows } = await query(
      `SELECT ${CAMPOS_MENSAJE}
       FROM Mensaje m
       INNER JOIN Usuario u ON m.id_voluntario = u.id_usuario
       INNER JOIN Usuario u2 ON m.id_usuario_destino = u2.id_usuario
       LEFT JOIN Evento e ON m.id_evento = e.id_evento
       WHERE m.id_usuario_destino = $1
       ORDER BY m.fecha DESC, m.id_mensaje DESC`,
      [idUsuarioDestino]
    );
    return rows;
  }

  async findDestinoValido(idUsuario) {
    const { rows } = await query(
      `SELECT id_usuario, rol
       FROM Usuario
       WHERE id_usuario = $1
         AND rol IN ('admin', 'organizador')
         AND activo = true`,
      [idUsuario]
    );
    return rows[0] || null;
  }

  async findEventoParaMensaje(idEvento) {
    const { rows } = await query(
      `SELECT
         e.id_evento, e.estado,
         o.id_usuario AS id_usuario_organizador
       FROM Evento e
       INNER JOIN Organizador o ON e.id_organizador = o.id_organizador
       WHERE e.id_evento = $1
         AND COALESCE(e.archivado, false) = false`,
      [idEvento]
    );
    return rows[0] || null;
  }

  async crear({ asunto, mensaje, idVoluntario, idDestino, idEvento }) {
    const { rows } = await query(
      `INSERT INTO Mensaje (asunto, mensaje, id_voluntario, id_usuario_destino, id_evento)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id_mensaje`,
      [asunto, mensaje, idVoluntario, idDestino, idEvento]
    );
    return rows[0].id_mensaje;
  }

  async crearRespuesta(idMensaje, texto, idUsuario) {
    await query(
      `INSERT INTO RespuestaMensaje (id_mensaje, texto, id_usuario)
       VALUES ($1, $2, $3)`,
      [idMensaje, texto, idUsuario]
    );
  }

  async findByIdYVoluntario(idMensaje, idVoluntario) {
    const { rows } = await query(
      `SELECT id_mensaje FROM Mensaje WHERE id_mensaje = $1 AND id_voluntario = $2`,
      [idMensaje, idVoluntario]
    );
    return rows[0] || null;
  }

  async findByIdYDestino(idMensaje, idUsuarioDestino) {
    const { rows } = await query(
      `SELECT id_mensaje FROM Mensaje WHERE id_mensaje = $1 AND id_usuario_destino = $2`,
      [idMensaje, idUsuarioDestino]
    );
    return rows[0] || null;
  }

  async marcarLeidoPorVoluntario(idMensaje, idVoluntario) {
    await query(
      `UPDATE Mensaje SET leido_por_voluntario = true
       WHERE id_mensaje = $1 AND id_voluntario = $2`,
      [idMensaje, idVoluntario]
    );
  }

  async marcarLeido(idMensaje) {
    await query(`UPDATE Mensaje SET leido = true WHERE id_mensaje = $1`, [idMensaje]);
  }

  async eliminarPorEvento(idEvento) {
    await query('DELETE FROM Mensaje WHERE id_evento = $1', [idEvento]);
  }
}

module.exports = new MensajeDAO();

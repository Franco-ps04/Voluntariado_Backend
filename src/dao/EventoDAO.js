const { query } = require('../config/db');
const BaseDAO = require('./BaseDAO');

const SELECT_EVENTO_BASE = `
  SELECT
    e.id_evento,
    e.nombre,
    e.descripcion,
    TO_CHAR(e.fecha, 'YYYY-MM-DD') AS fecha,
    TO_CHAR(e.hora, 'HH24:MI:SS') AS hora,
    e.ubicacion,
    e.capacidad,
    COALESCE((SELECT COUNT(*)::int FROM Inscripcion i WHERE i.id_evento = e.id_evento AND i.estado <> 'Cancelado'), 0) AS inscritos,
    e.estado,
    e.latitud,
    e.longitud,
    e.imagen_url,
    e.id_tipo,
    e.id_organizador,
    t.nombre AS tipo,
    u.nombre AS organizador,
    u.id_usuario AS id_usuario_organizador,
    o.nombre_organizacion AS organizacion
  FROM Evento e
  INNER JOIN TipoEvento t ON e.id_tipo = t.id_tipo
  INNER JOIN Organizador o ON e.id_organizador = o.id_organizador
  INNER JOIN Usuario u ON o.id_usuario = u.id_usuario
`;

class EventoDAO extends BaseDAO {
  constructor() {
    super('Evento', 'id_evento');
  }

  async findRequisitos(idEvento) {
    const { rows } = await query(
      `SELECT descripcion
       FROM EventoRequisito
       WHERE id_evento = $1
       ORDER BY orden ASC, id_requisito ASC`,
      [idEvento]
    );
    return rows.map((r) => r.descripcion);
  }
/* 
  
   * Trae los requisitos de VARIOS eventos en una sola consulta (evita el
   * patrón N+1 de llamar findRequisitos() una vez por cada evento listado).
   * @param {number[]} idEventos
   * @returns {Promise<Map<number, string[]>>} id_evento -> [descripciones]
   
  async findRequisitosPorEventos(idEventos) {
    const mapa = new Map();
    if (!idEventos || idEventos.length === 0) return mapa;

    const { rows } = await query(
      `SELECT id_evento, descripcion
       FROM EventoRequisito
       WHERE id_evento = ANY($1::int[])
       ORDER BY id_evento ASC, orden ASC, id_requisito ASC`,
      [idEventos]
    );

    for (const row of rows) {
      const lista = mapa.get(row.id_evento) ?? [];
      lista.push(row.descripcion);
      mapa.set(row.id_evento, lista);
    }
    return mapa;
  } */

  async insertarRequisito(idEvento, descripcion, orden) {
    await query(
      `INSERT INTO EventoRequisito (id_evento, descripcion, orden)
       VALUES ($1, $2, $3)`,
      [idEvento, descripcion, orden]
    );
  }

  async eliminarRequisitos(idEvento) {
    await query('DELETE FROM EventoRequisito WHERE id_evento = $1', [idEvento]);
  }

  async findByIdCompleto(idEvento) {
    const { rows } = await query(
      `${SELECT_EVENTO_BASE}
       WHERE e.id_evento = $1`,
      [idEvento]
    );
    return rows[0] || null;
  }

  async listar({ tipo, estado } = {}) {
    const condiciones = ['COALESCE(e.archivado, false) = false'];
    const params = [];

    if (tipo) {
      params.push(tipo);
      condiciones.push(`t.nombre = $${params.length}`);
    }
    if (estado) {
      params.push(estado);
      condiciones.push(`e.estado = $${params.length}`);
    } else {
      condiciones.push(`e.estado IN ('Próximo', 'En curso')`);
    }

    const { rows } = await query(
      `${SELECT_EVENTO_BASE}
       WHERE ${condiciones.join(' AND ')}
       ORDER BY e.fecha DESC, e.hora DESC, e.id_evento DESC`,
      params
    );
    return rows;
  }

  async listarGestion({ idOrganizador } = {}) {
    const condiciones = ['COALESCE(e.archivado, false) = false'];
    const params = [];

    if (idOrganizador) {
      params.push(idOrganizador);
      condiciones.push(`e.id_organizador = $${params.length}`);
    }

    const { rows } = await query(
      `SELECT
         e.id_evento, e.nombre, e.descripcion,
         TO_CHAR(e.fecha, 'YYYY-MM-DD') AS fecha,
         TO_CHAR(e.hora, 'HH24:MI:SS') AS hora,
         e.ubicacion, e.capacidad,
         COALESCE((SELECT COUNT(*)::int FROM Inscripcion i WHERE i.id_evento = e.id_evento AND i.estado <> 'Cancelado'), 0) AS inscritos,
         e.estado, e.latitud, e.longitud, e.imagen_url,
         t.nombre AS tipo,
         u.nombre AS organizador,
         u.id_usuario AS id_usuario_organizador,
         o.nombre_organizacion AS organizacion,
         e.id_organizador
       FROM Evento e
       INNER JOIN TipoEvento t ON e.id_tipo = t.id_tipo
       INNER JOIN Organizador o ON e.id_organizador = o.id_organizador
       INNER JOIN Usuario u ON o.id_usuario = u.id_usuario
       WHERE ${condiciones.join(' AND ')}
       ORDER BY e.fecha DESC, e.hora DESC, e.id_evento DESC`,
      params
    );
    return rows;
  }

  async crear(datos) {
    const {
      nombre, descripcion, fecha, hora, ubicacion, capacidad,
      idTipo, idOrganizador, latitud, longitud, imagenUrl
    } = datos;

    const { rows } = await query(
      `INSERT INTO Evento (
         nombre, descripcion, fecha, hora, ubicacion, capacidad,
         id_tipo, id_organizador, latitud, longitud, imagen_url
       )
       VALUES ($1, $2, $3, $4::time, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id_evento`,
      [nombre, descripcion, fecha, hora, ubicacion, capacidad, idTipo, idOrganizador, latitud, longitud, imagenUrl]
    );
    return rows[0].id_evento;
  }

  async actualizar(idEvento, datos) {
    const {
      nombre, descripcion, fecha, hora, ubicacion, capacidad,
      idTipo, idOrganizador, latitud, longitud, imagenUrl
    } = datos;

    await query(
      `UPDATE Evento
       SET nombre = $1, descripcion = $2, fecha = $3, hora = $4::time,
           ubicacion = $5, capacidad = $6, id_tipo = $7, id_organizador = $8,
           latitud = $9, longitud = $10, imagen_url = $11
       WHERE id_evento = $12`,
      [nombre, descripcion, fecha, hora, ubicacion, capacidad, idTipo, idOrganizador, latitud, longitud, imagenUrl, idEvento]
    );
  }

  async actualizarEstado(idEvento, estado) {
    await query('UPDATE Evento SET estado = $1 WHERE id_evento = $2', [estado, idEvento]);
  }

  async archivar(idEvento) {
    await query('UPDATE Evento SET archivado = true WHERE id_evento = $1', [idEvento]);
  }

  async findActivosPorOrganizador(idOrganizador) {
    const { rows } = await query(
      `SELECT id_evento
       FROM Evento
       WHERE id_organizador = $1
         AND COALESCE(archivado, false) = false
         AND estado IN ('Próximo', 'En curso')`,
      [idOrganizador]
    );
    return rows.map((r) => r.id_evento);
  }

  async eliminarFisico(idEvento) {
    await query('DELETE FROM Evento WHERE id_evento = $1', [idEvento]);
  }
}

module.exports = new EventoDAO();

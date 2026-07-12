const eventoDAO = require('../dao/EventoDAO');
const organizadorDAO = require('../dao/OrganizadorDAO');
const notificacionDAO = require('../dao/NotificacionDAO');
const { subirImagenEvento } = require('../config/supabaseStorage');
const {
  parseRequisitos,
  normalizeHora,
  toOptionalNumber,
  calcularEstadoAutomatico,
  validateDateTime,
  validateCoordinates
} = require('../utils/eventoHelpers');

async function ensureAdminOrganizer(idUsuario) {
  const existing = await organizadorDAO.findByUsuarioId(idUsuario);
  if (existing) return existing;

  const idOrganizador = await organizadorDAO.crear(idUsuario, 'Administrador');
  return { id_organizador: idOrganizador, nombre_organizacion: 'Administrador' };
}

async function sincronizarEstadoAutomatico(evento) {
  const nuevoEstado = calcularEstadoAutomatico(evento);
  const actual = String(evento?.estado ?? '').trim();
  if (nuevoEstado !== actual && Number(evento?.id_evento)) {
    await eventoDAO.actualizarEstado(Number(evento.id_evento), nuevoEstado);
  }
  return { ...evento, estado: nuevoEstado };
}

async function getEventoCompleto(idEvento) {
  const evento = await eventoDAO.findByIdCompleto(idEvento);
  if (!evento) return null;
  evento.requisitos = await eventoDAO.findRequisitos(idEvento);
  return sincronizarEstadoAutomatico(evento);
}

async function registrarCambioEstadoEvento(idEvento, estado, idUsuario) {
  const evento = await getEventoCompleto(idEvento);
  if (!evento) return;

  const titulo = estado === 'Cancelado' ? 'Evento cancelado' : 'Evento finalizado';
  const mensaje = estado === 'Cancelado'
    ? `El evento "${evento.nombre}" fue cancelado.`
    : `El evento "${evento.nombre}" fue finalizado.`;

  await notificacionDAO.crear({ titulo, mensaje, idUsuario, idEvento });
}

async function resolveEventPayload(req, existingEvento = null) {
  const {
    nombre, descripcion, fecha, hora, ubicacion, capacidad,
    idTipo, idOrganizador, latitud, longitud, requisitos, imagenUrl
  } = req.body;

  const nombreLimpio = String(nombre ?? '').trim();
  const descripcionLimpia = String(descripcion ?? '').trim();
  const fechaLimpia = String(fecha ?? '').trim();
  const horaNormalizada = normalizeHora(hora);
  const ubicacionLimpia = String(ubicacion ?? '').trim();
  const tipoId = Number(idTipo);

  if (!nombreLimpio || !descripcionLimpia || !fechaLimpia || !horaNormalizada || !ubicacionLimpia || !tipoId) {
    return { error: 'Faltan campos obligatorios' };
  }

  const datetimeError = validateDateTime(fechaLimpia, horaNormalizada);
  if (datetimeError) {
    return { error: datetimeError };
  }

  const lat = toOptionalNumber(latitud);
  const lon = toOptionalNumber(longitud);
  const coordError = validateCoordinates(lat, lon);
  if (coordError) {
    return { error: coordError };
  }

  const capacidadNum = Number(capacidad);
  if (!Number.isFinite(capacidadNum) || capacidadNum < 1) {
    return { error: 'La capacidad debe ser al menos 1' };
  }
  if (capacidadNum > 50) {
    return { error: 'La capacidad máxima permitida es 50 voluntarios' };
  }

  let idOrgReal = null;
  if (req.usuario.rol === 'organizador') {
    const org = await organizadorDAO.findByUsuarioId(req.usuario.id);
    idOrgReal = org?.id_organizador || null;
  } else if (req.usuario.rol === 'admin') {
    const idOrgDesdeBody = Number(idOrganizador);
    if (Number.isFinite(idOrgDesdeBody) && idOrgDesdeBody > 0) {
      const orgExiste = await organizadorDAO.findByIdExiste(idOrgDesdeBody);
      if (!orgExiste) {
        return { error: 'El organizador seleccionado no existe' };
      }
      idOrgReal = idOrgDesdeBody;
    } else if (existingEvento?.id_organizador) {
      idOrgReal = Number(existingEvento.id_organizador);
    } else {
      const orgAdmin = await ensureAdminOrganizer(req.usuario.id);
      idOrgReal = Number(orgAdmin.id_organizador);
    }
  }

  if (!idOrgReal) {
    return {
      error: req.usuario.rol === 'organizador'
        ? 'No se encontró el organizador asociado a tu cuenta'
        : 'No se pudo determinar el organizador del evento'
    };
  }

  let imagenFinal = null;
  if (req.file) {
    imagenFinal = await subirImagenEvento(req.file.buffer, req.file.originalname, req.file.mimetype);
  } else {
    const imagenLimpia = imagenUrl === undefined || imagenUrl === null ? '' : String(imagenUrl).trim();
    if (imagenLimpia) {
      imagenFinal = imagenLimpia;
    } else if (existingEvento) {
      imagenFinal = existingEvento.imagen_url || null;
    }
  }

  return {
    nombre: nombreLimpio,
    descripcion: descripcionLimpia,
    fecha: fechaLimpia,
    hora: horaNormalizada,
    ubicacion: ubicacionLimpia,
    capacidad: capacidadNum,
    idTipo: tipoId,
    idOrgReal,
    latitud: lat,
    longitud: lon,
    imagenFinal,
    requisitos: parseRequisitos(requisitos)
  };
}

// GET /api/eventos
async function listar(req, res) {
  try {
    const eventos = await eventoDAO.listar({ tipo: req.query.tipo, estado: req.query.estado });

    /* const requisitosPorEvento = await eventoDAO.findRequisitosPorEventos(eventos.map(e => e.id_evento));
    const data = await Promise.all(
      eventos.map(ev => sincronizarEstadoAutomatico({
        ...ev,
        requisitos: requisitosPorEvento.get(ev.id_evento) ?? []
      }))
    ); */

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/eventos/gestion
async function listarGestion(req, res) {
  try {
    let idOrganizador;
    if (req.usuario.rol === 'organizador') {
      const org = await organizadorDAO.findByUsuarioId(req.usuario.id);
      if (!org) {
        return res.json([]);
      }
      idOrganizador = org.id_organizador;
    }

    const eventos = await eventoDAO.listarGestion({ idOrganizador });

    /* const requisitosPorEvento = await eventoDAO.findRequisitosPorEventos(eventos.map(e => e.id_evento));
    const data = await Promise.all(
      eventos.map(ev => sincronizarEstadoAutomatico({
        ...ev,
        requisitos: requisitosPorEvento.get(ev.id_evento) ?? []
      }))
    ); */

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/eventos/organizadores/lista
async function listarOrganizadores(req, res) {
  try {
    const organizadores = await organizadorDAO.listarActivos();
    res.json(organizadores);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/eventos/:id
async function obtener(req, res) {
  try {
    const evento = await getEventoCompleto(Number(req.params.id));
    if (!evento) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }
    res.json(evento);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// POST /api/eventos
async function crear(req, res) {
  try {
    const resolved = await resolveEventPayload(req);
    if (resolved.error) {
      return res.status(400).json({ message: resolved.error });
    }

    const {
      nombre, descripcion, fecha, hora, ubicacion, capacidad,
      idTipo, idOrgReal, latitud, longitud, imagenFinal, requisitos
    } = resolved;

    const newId = await eventoDAO.crear({
      nombre, descripcion, fecha, hora, ubicacion, capacidad,
      idTipo, idOrganizador: idOrgReal, latitud, longitud, imagenUrl: imagenFinal
    });

    for (let i = 0; i < requisitos.length; i++) {
      await eventoDAO.insertarRequisito(newId, requisitos[i], i + 1);
    }

    res.status(201).json({ id: newId, message: 'Evento creado correctamente' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// PUT /api/eventos/:id
async function actualizar(req, res) {
  try {
    const idEvento = Number(req.params.id);
    const eventoActual = await getEventoCompleto(idEvento);

    if (!eventoActual) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }

    if (req.usuario.rol === 'organizador' || req.usuario.rol === 'admin') {
      if (Number(eventoActual.id_usuario_organizador) !== Number(req.usuario.id)) {
        return res.status(403).json({ message: 'Sin permisos suficientes' });
      }
    }

    if (eventoActual.estado !== 'Próximo') {
      return res.status(400).json({ message: 'Solo se puede editar un evento mientras está en estado "Próximo"' });
    }

    const resolved = await resolveEventPayload(req, eventoActual);
    if (resolved.error) {
      return res.status(400).json({ message: resolved.error });
    }

    const {
      nombre, descripcion, fecha, hora, ubicacion, capacidad,
      idTipo, idOrgReal, latitud, longitud, imagenFinal, requisitos
    } = resolved;

    await eventoDAO.actualizar(idEvento, {
      nombre, descripcion, fecha, hora, ubicacion, capacidad,
      idTipo, idOrganizador: idOrgReal, latitud, longitud, imagenUrl: imagenFinal
    });

    await eventoDAO.eliminarRequisitos(idEvento);
    for (let i = 0; i < requisitos.length; i++) {
      await eventoDAO.insertarRequisito(idEvento, requisitos[i], i + 1);
    }

    res.json({ ok: true, message: 'Evento actualizado correctamente' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// PATCH /api/eventos/:id/estado
async function cambiarEstado(req, res) {
  const estados = ['Próximo', 'En curso', 'Finalizado', 'Cancelado'];
  if (!estados.includes(req.body.estado)) {
    return res.status(400).json({ message: 'Estado inválido' });
  }

  try {
    const idEvento = Number(req.params.id);
    const evento = await getEventoCompleto(idEvento);

    if (!evento) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }

    if (req.usuario.rol === 'organizador' || req.usuario.rol === 'admin') {
      if (Number(evento.id_usuario_organizador) !== Number(req.usuario.id)) {
        return res.status(403).json({ message: 'Sin permisos suficientes' });
      }
    }

    if (evento.estado !== req.body.estado) {
      await eventoDAO.actualizarEstado(idEvento, req.body.estado);

      if (req.body.estado === 'Cancelado' || req.body.estado === 'Finalizado') {
        await registrarCambioEstadoEvento(idEvento, req.body.estado, req.usuario.id);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// DELETE /api/eventos/:id
// Archivo lógico: solo oculta el evento del listado global sin borrar su historial
async function archivar(req, res) {
  try {
    const idEvento = Number(req.params.id);
    const evento = await getEventoCompleto(idEvento);

    if (!evento) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }

    if (req.usuario.rol === 'organizador') {
      if (Number(evento.id_usuario_organizador) !== Number(req.usuario.id)) {
        return res.status(403).json({ message: 'Sin permisos suficientes' });
      }
    }

    await eventoDAO.archivar(idEvento);

    res.json({ ok: true, archivado: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = {
  listar,
  listarGestion,
  listarOrganizadores,
  obtener,
  crear,
  actualizar,
  cambiarEstado,
  archivar
};
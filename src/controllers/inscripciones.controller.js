const inscripcionDAO = require('../dao/InscripcionDAO');
const asistenciaDAO = require('../dao/AsistenciaDAO');

// GET /api/inscripciones/mis
async function misInscripciones(req, res) {
  try {
    const data = await inscripcionDAO.misInscripciones(req.usuario.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/inscripciones?eventoId
async function inscritosDeEvento(req, res) {
  const { eventoId } = req.query;
  if (!eventoId)
    return res.status(400).json({ message: 'eventoId es requerido' });

  try {
    const data = await inscripcionDAO.inscritosDeEvento(eventoId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// POST /api/inscripciones
// Body: { idEvento }
async function inscribirse(req, res) {
  const { idEvento } = req.body;
  if (!idEvento)
    return res.status(400).json({ message: 'idEvento es requerido' });

  try {
    const row = await inscripcionDAO.findByVoluntarioYEvento(req.usuario.id, idEvento);

    if (row && row.estado !== 'Cancelado')
      return res.status(409).json({ message: 'Ya estás inscrito en este evento' });

    const ev = await inscripcionDAO.findDisponibilidadEvento(idEvento);
    if (!ev)
      return res.status(404).json({ message: 'Evento no encontrado' });
    if (ev.estado !== 'Próximo' && ev.estado !== 'En curso')
      return res.status(400).json({ message: 'El evento no está disponible para inscripciones' });
    if (ev.inscritos >= ev.capacidad)
      return res.status(400).json({ message: 'El evento está lleno' });

    let newId = row?.id_inscripcion ?? null;

    if (row && row.estado === 'Cancelado') {
      await inscripcionDAO.reactivar(row.id_inscripcion);
      // Reiniciar la asistencia para una nueva inscripción
      await asistenciaDAO.eliminarPorInscripcion(row.id_inscripcion);
      newId = row.id_inscripcion;
    } else {
      newId = await inscripcionDAO.crear(req.usuario.id, idEvento);
    }

    if (!newId) {
      return res.status(500).json({ message: 'No se pudo registrar la inscripción' });
    }

    await inscripcionDAO.incrementarInscritos(Number(idEvento));

    res.status(201).json({ id: newId, message: 'Inscripción realizada correctamente' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// PATCH /api/inscripciones/:id/cancelar
async function cancelar(req, res) {
  try {
    const check = await inscripcionDAO.findByIdYVoluntario(req.params.id, req.usuario.id);

    if (!check)
      return res.status(404).json({ message: 'Inscripción no encontrada' });
    if (check.estado === 'Finalizado')
      return res.status(400).json({ message: 'No se puede cancelar un evento finalizado' });

    await inscripcionDAO.cancelar(req.params.id);
    await inscripcionDAO.decrementarInscritosPorInscripcion(req.params.id);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { misInscripciones, inscritosDeEvento, inscribirse, cancelar };

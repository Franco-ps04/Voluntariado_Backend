const mensajeDAO = require('../dao/MensajeDAO');
const { estadoKey } = require('../utils/validators');

// GET /api/mensajes/destinatarios
async function destinatarios(req, res) {
  try {
    const data = await mensajeDAO.destinatariosParaVoluntario();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/mensajes/mis
async function misMensajes(req, res) {
  try {
    const msgs = await mensajeDAO.misMensajes(req.usuario.id);

    const data = [];
    for (const msg of msgs) {
      const historial = await mensajeDAO.getHistorial(msg.id_mensaje);
      data.push({ ...msg, historial });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// POST /api/mensajes
async function crear(req, res) {
  const { idUsuarioDestino, idDestinatario, asunto, mensaje, idEvento } = req.body;

  const destino = Number(idUsuarioDestino || idDestinatario);
  const asuntoLimpio = String(asunto ?? '').trim();
  const mensajeLimpio = String(mensaje ?? '').trim();
  const idEvt = idEvento === undefined || idEvento === null || String(idEvento).trim() === ''
    ? null
    : Number(idEvento);

  if (!destino || !asuntoLimpio || !mensajeLimpio) {
    return res.status(400).json({ message: 'Faltan campos obligatorios' });
  }
  if (asuntoLimpio.length > 150) {
    return res.status(400).json({ message: 'El asunto no debe superar 150 caracteres' });
  }
  if (mensajeLimpio.length > 5000) {
    return res.status(400).json({ message: 'El mensaje es demasiado largo' });
  }

  try {
    const destinoOk = await mensajeDAO.findDestinoValido(destino);
    if (!destinoOk) {
      return res.status(400).json({ message: 'El destinatario debe ser un administrador u organizador activo' });
    }

    if (idEvt) {
      const evento = await mensajeDAO.findEventoParaMensaje(idEvt);
      if (!evento) {
        return res.status(404).json({ message: 'El evento no existe' });
      }

      const estado = estadoKey(evento.estado);
      if (estado === 'finalizado' || estado === 'cancelado') {
        return res.status(400).json({ message: 'Solo puedes enviar mensajes mientras el evento esté activo' });
      }

      if (destinoOk.rol === 'organizador' &&
        Number(destinoOk.id_usuario) !== Number(evento.id_usuario_organizador)) {
        return res.status(400).json({ message: 'El organizador seleccionado no corresponde al evento' });
      }
    }

    const idMensaje = await mensajeDAO.crear({
      asunto: asuntoLimpio,
      mensaje: mensajeLimpio,
      idVoluntario: req.usuario.id,
      idDestino: destino,
      idEvento: idEvt
    });

    res.status(201).json({ ok: true, id: idMensaje });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// POST /api/mensajes/:id/seguimiento
async function seguimiento(req, res) {
  const { texto } = req.body;
  if (!texto || !texto.trim()) {
    return res.status(400).json({ message: 'El texto no puede estar vacío' });
  }

  try {
    const check = await mensajeDAO.findByIdYVoluntario(req.params.id, req.usuario.id);
    if (!check) {
      return res.status(404).json({ message: 'Mensaje no encontrado' });
    }

    await mensajeDAO.crearRespuesta(req.params.id, texto.trim(), req.usuario.id);

    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// PATCH /api/mensajes/:id/leido
async function marcarLeidoVoluntario(req, res) {
  try {
    await mensajeDAO.marcarLeidoPorVoluntario(req.params.id, req.usuario.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/mensajes/panel
async function panel(req, res) {
  try {
    const msgs = await mensajeDAO.panelDestinatario(req.usuario.id);

    const data = [];
    for (const msg of msgs) {
      const historial = await mensajeDAO.getHistorial(msg.id_mensaje);
      data.push({ ...msg, historial });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// PATCH /api/mensajes/:id/marcar-leido
async function marcarLeidoAdmin(req, res) {
  try {
    const check = await mensajeDAO.findByIdYDestino(req.params.id, req.usuario.id);
    if (!check) {
      return res.status(404).json({ message: 'Mensaje no encontrado' });
    }

    await mensajeDAO.marcarLeido(req.params.id);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// POST /api/mensajes/:id/responder
async function responder(req, res) {
  const { texto } = req.body;
  if (!texto || !texto.trim()) {
    return res.status(400).json({ message: 'La respuesta no puede estar vacía' });
  }

  try {
    const check = await mensajeDAO.findByIdYDestino(req.params.id, req.usuario.id);
    if (!check) {
      return res.status(404).json({ message: 'Mensaje no encontrado' });
    }

    await mensajeDAO.crearRespuesta(req.params.id, texto.trim(), req.usuario.id);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = {
  destinatarios,
  misMensajes,
  crear,
  seguimiento,
  marcarLeidoVoluntario,
  panel,
  marcarLeidoAdmin,
  responder
};

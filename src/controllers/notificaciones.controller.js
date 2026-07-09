const notificacionDAO = require('../dao/NotificacionDAO');
const { estadoKey, conteoPalabras } = require('../utils/validators');

// GET /api/notificaciones/mis
async function misNotificaciones(req, res) {
  try {
    const data = await notificacionDAO.misNotificaciones(req.usuario.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// PATCH /api/notificaciones/:id/leida
async function marcarLeida(req, res) {
  try {
    await notificacionDAO.marcarLeida(req.params.id, req.usuario.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// POST /api/notificaciones
// Body: { idEvento, titulo, mensaje }
async function crear(req, res) {
  const { idEvento, titulo, mensaje } = req.body;
  const idEvt = Number(idEvento);
  const tituloLimpio = String(titulo ?? '').trim();
  const mensajeLimpio = String(mensaje ?? '').trim();

  if (!Number.isFinite(idEvt) || idEvt < 1) {
    return res.status(400).json({ message: 'Selecciona un evento válido' });
  }
  if (!tituloLimpio || !mensajeLimpio) {
    return res.status(400).json({ message: 'Faltan campos obligatorios' });
  }
  if (tituloLimpio.length > 150) {
    return res.status(400).json({ message: 'El título no debe superar 150 caracteres' });
  }
  if (conteoPalabras(mensajeLimpio) > 500) {
    return res.status(400).json({ message: 'El mensaje no debe superar 500 palabras' });
  }

  try {
    const evento = await notificacionDAO.findEventoParaNotificacion(idEvt);
    if (!evento) {
      return res.status(404).json({ message: 'El evento no existe' });
    }

    const estado = estadoKey(evento.estado);
    if (estado === 'finalizado' || estado === 'cancelado') {
      return res.status(400).json({ message: 'Solo puedes enviar notificaciones a eventos activos' });
    }

    const idNotificacion = await notificacionDAO.crear({
      titulo: tituloLimpio,
      mensaje: mensajeLimpio,
      idUsuario: req.usuario.id,
      idEvento: idEvt
    });

    res.status(201).json({ id: idNotificacion, ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/notificaciones
async function listarEnviadas(req, res) {
  try {
    const data = await notificacionDAO.listarEnviadasPor(req.usuario.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { misNotificaciones, marcarLeida, crear, listarEnviadas };

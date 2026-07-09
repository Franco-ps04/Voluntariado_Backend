const asistenciaDAO = require('../dao/AsistenciaDAO');
const inscripcionDAO = require('../dao/InscripcionDAO');
const { emitirCertificadosSiCorresponde } = require('./certificados.controller');

// GET /api/asistencia/:eventoId
async function listarPorEvento(req, res) {
  try {
    const data = await asistenciaDAO.findByEventoDetallado(req.params.eventoId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// PUT /api/asistencia/:inscripcionId
// Body: { asistio: true | false }
// El TRIGGER TR_Asistencia_Certificado emitirá certificados automáticamente
// si asistio pasa a true durante un UPDATE.
async function registrar(req, res) {
  const { asistio } = req.body;
  if (typeof asistio !== 'boolean')
    return res.status(400).json({ message: 'asistio debe ser true o false' });

  try {
    const idInscripcion = req.params.inscripcionId;
    const existente = await asistenciaDAO.findByInscripcion(idInscripcion);

    if (!existente) {
      await asistenciaDAO.crear(idInscripcion, asistio);
    } else {
      await asistenciaDAO.actualizar(idInscripcion, asistio);
    }

    if (asistio) {
      await inscripcionDAO.marcarFinalizada(idInscripcion);

      const idVol = await inscripcionDAO.findVoluntarioByInscripcion(idInscripcion);
      if (idVol) {
        await emitirCertificadosSiCorresponde(Number(idVol));
      }
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { listarPorEvento, registrar };

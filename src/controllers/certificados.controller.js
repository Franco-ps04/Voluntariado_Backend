const certificadoDAO = require('../dao/CertificadoDAO');
const asistenciaDAO = require('../dao/AsistenciaDAO');

// Emite automáticamente los certificados cuyo umbral ya fue alcanzado por el
// voluntario. Normalmente el TRIGGER de la base de datos lo hace al
// confirmar una asistencia; esta función existe para los casos donde se
// necesita verificar/forzar la emisión desde el backend (idempotente:
// nunca duplica un certificado ya emitido).
async function emitirCertificadosSiCorresponde(idVoluntario) {
  const total = await asistenciaDAO.countConfirmadasPorVoluntario(idVoluntario);
  const configs = await certificadoDAO.listarConfigsActivos();

  const emitidos = [];
  for (const cfg of configs) {
    if (total < Number(cfg.umbral ?? 0)) continue;

    const yaExiste = await certificadoDAO.existeParaVoluntarioYConfig(idVoluntario, cfg.id_config);
    if (yaExiste) continue;

    await certificadoDAO.emitir({
      titulo: cfg.titulo,
      motivo: cfg.motivo,
      color: cfg.color,
      cantidad: total,
      idVoluntario,
      idConfig: cfg.id_config
    });

    emitidos.push(cfg.titulo);
  }

  return { totalAsistencias: total, emitidos };
}

// GET /api/certificados/mis
async function misCertificados(req, res) {
  try {
    const data = await certificadoDAO.misCertificados(req.usuario.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/certificados
async function listarTodos(req, res) {
  try {
    const data = await certificadoDAO.listarTodos();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// POST /api/certificados/verificar/:idVoluntario
async function verificar(req, res) {
  try {
    const idVol = parseInt(req.params.idVoluntario);
    const resultado = await emitirCertificadosSiCorresponde(idVol);
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { misCertificados, listarTodos, verificar, emitirCertificadosSiCorresponde };

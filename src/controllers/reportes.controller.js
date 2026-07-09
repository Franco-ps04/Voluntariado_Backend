const reporteDAO = require('../dao/ReporteDAO');

// GET /api/reportes/resumen
async function resumen(req, res) {
  try {
    const eventos = await reporteDAO.resumenEventos();
    const voluntarios = await reporteDAO.topVoluntarios();

    const totalEventos = eventos.length;
    const totalInscritos = eventos.reduce((s, e) => s + Number(e.inscritos ?? 0), 0);
    const totalAsistieron = eventos.reduce((s, e) => s + Number(e.asistieron ?? 0), 0);
    const pctAsistencia = totalInscritos > 0 ? Math.round((totalAsistieron / totalInscritos) * 100) : 0;

    res.json({
      resumen: { totalEventos, totalInscritos, pctAsistencia },
      eventos,
      voluntarios
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { resumen };

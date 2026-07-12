const reporteDAO = require('../dao/ReporteDAO');
const { generarExcelReportes, generarPdfReportes } = require('../utils/exportReportes');

async function obtenerDatosReporte() {
  const eventos = await reporteDAO.resumenEventos();
  const voluntarios = await reporteDAO.topVoluntarios();

  const totalEventos = eventos.length;
  const totalInscritos = eventos.reduce((s, e) => s + Number(e.inscritos ?? 0), 0);
  const totalAsistieron = eventos.reduce((s, e) => s + Number(e.asistieron ?? 0), 0);
  const pctAsistencia = totalInscritos > 0 ? Math.round((totalAsistieron / totalInscritos) * 100) : 0;

  return { resumen: { totalEventos, totalInscritos, pctAsistencia }, eventos, voluntarios };
}

// GET /api/reportes/resumen
async function resumen(req, res) {
  try {
    const datos = await obtenerDatosReporte();
    res.json(datos);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/reportes/exportar?formato=xlsx|pdf
async function exportar(req, res) {
  const formato = String(req.query.formato ?? '').toLowerCase();
  if (!['xlsx', 'pdf'].includes(formato)) {
    return res.status(400).json({ message: 'El formato debe ser "xlsx" o "pdf"' });
  }

  try {
    const datos = await obtenerDatosReporte();
    const fecha = new Date().toISOString().slice(0, 10);

    if (formato === 'xlsx') {
      const buffer = await generarExcelReportes(datos);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="reporte_${fecha}.xlsx"`);
      return res.send(buffer);
    }

    const buffer = await generarPdfReportes(datos);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reporte_${fecha}.pdf"`);
    return res.send(buffer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { resumen, exportar };
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const COLUMNAS = [
  { header: 'ID', key: 'id_usuario', width: 8 },
  { header: 'Nombre', key: 'nombre', width: 28 },
  { header: 'Email', key: 'email', width: 30 },
  { header: 'Teléfono', key: 'telefono', width: 14 },
  { header: 'Rol', key: 'rol', width: 14 },
  { header: 'Estado', key: 'estado', width: 12 },
  { header: 'Organización', key: 'organizacion', width: 24 },
  { header: 'Eventos finalizados', key: 'num_eventos', width: 18 },
  { header: 'Registrado el', key: 'creado_en', width: 14 }
];

function normalizarFila(u) {
  return {
    id_usuario: u.id_usuario,
    nombre: u.nombre,
    email: u.email,
    telefono: u.telefono,
    rol: u.rol,
    estado: u.activo ? 'Activo' : 'Suspendido',
    organizacion: u.organizacion ?? '—',
    num_eventos: u.num_eventos ?? 0,
    creado_en: u.creado_en ?? '—'
  };
}

/**
 * Genera un archivo Excel (.xlsx) con uno o varios usuarios.
 * @param {object[]} usuarios - filas ya obtenidas de UsuarioDAO
 * @param {string} titulo - título de la hoja/reporte
 * @returns {Promise<Buffer>}
 */
async function generarExcelUsuarios(usuarios, titulo = 'Usuarios') {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'GreenUnity';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(titulo.substring(0, 31)); // Excel limita el nombre a 31 caracteres
  sheet.columns = COLUMNAS;

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2D9E5F' }
  };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  usuarios.forEach((u) => sheet.addRow(normalizarFila(u)));

  sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + COLUMNAS.length)}1` };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Genera un archivo PDF con uno o varios usuarios, en formato tabla simple.
 * @param {object[]} usuarios
 * @param {string} titulo
 * @returns {Promise<Buffer>}
 */
function generarPdfUsuarios(usuarios, titulo = 'Usuarios') {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).fillColor('#2D9E5F').text(`GreenUnity — ${titulo}`, { align: 'left' });
    doc.fontSize(9).fillColor('#666666')
      .text(`Generado el ${new Date().toLocaleString('es-PE')} — ${usuarios.length} usuario(s)`);
    doc.moveDown(1);

    const cols = [
      { label: 'Nombre', width: 130 },
      { label: 'Email', width: 150 },
      { label: 'Teléfono', width: 70 },
      { label: 'Rol', width: 70 },
      { label: 'Estado', width: 60 },
      { label: 'Organización', width: 120 },
      { label: 'Eventos', width: 50 }
    ];

    let y = doc.y;
    const startX = doc.x;
    const rowHeight = 20;

    function drawHeader() {
      let x = startX;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
      doc.rect(startX, y, cols.reduce((s, c) => s + c.width, 0), rowHeight).fill('#2D9E5F');
      doc.fillColor('#ffffff');
      cols.forEach((c) => {
        doc.text(c.label, x + 4, y + 6, { width: c.width - 8, ellipsis: true });
        x += c.width;
      });
      y += rowHeight;
    }

    function drawRow(row, index) {
      let x = startX;
      if (index % 2 === 0) {
        doc.rect(startX, y, cols.reduce((s, c) => s + c.width, 0), rowHeight).fill('#F3F7F4');
      }
      doc.font('Helvetica').fontSize(8).fillColor('#222222');
      const values = [
        row.nombre, row.email, row.telefono, row.rol,
        row.activo ? 'Activo' : 'Suspendido',
        row.organizacion ?? '—',
        String(row.num_eventos ?? 0)
      ];
      values.forEach((val, i) => {
        doc.text(String(val ?? ''), x + 4, y + 6, { width: cols[i].width - 8, ellipsis: true });
        x += cols[i].width;
      });
      y += rowHeight;
    }

    drawHeader();
    usuarios.forEach((u, i) => {
      if (y > doc.page.height - 60) {
        doc.addPage();
        y = doc.y;
        drawHeader();
      }
      drawRow(u, i);
    });

    doc.end();
  });
}

module.exports = { generarExcelUsuarios, generarPdfUsuarios };

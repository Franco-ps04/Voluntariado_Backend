const multer = require('multer');

// Antes: multer.diskStorage(...) guardaba en /uploads/eventos (disco local).
// Ahora: memoryStorage mantiene el archivo en RAM (req.file.buffer) para
// subirlo directamente a Supabase Storage. Esto es necesario porque el
// disco de un Web Service de Render es efímero (se borra en cada redeploy).
const storage = multer.memoryStorage();

const uploadEvento = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

module.exports = { uploadEvento };

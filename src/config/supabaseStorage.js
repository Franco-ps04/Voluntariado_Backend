const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'eventos';

let clienteSupabase = null;

function getClienteSupabase() {
  if (clienteSupabase) return clienteSupabase;

  const url = process.env.SUPABASE_URL;
  // La service_role key es necesaria para poder subir archivos desde el
  // backend sin pasar por las políticas de Row Level Security (RLS).
  // NUNCA se expone al frontend, solo vive en el servidor.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno'
    );
  }

  clienteSupabase = createClient(url, key);
  return clienteSupabase;
}

/**
 * Sube la imagen de un evento (recibida en memoria vía multer) al bucket de
 * Supabase Storage y devuelve su URL pública.
 * @param {Buffer} buffer - contenido del archivo (req.file.buffer)
 * @param {string} originalName - nombre original del archivo subido
 * @param {string} mimetype - tipo MIME del archivo
 * @returns {Promise<string>} URL pública de la imagen
 */
async function subirImagenEvento(buffer, originalName, mimetype) {
  const supabase = getClienteSupabase();
  const ext = path.extname(originalName || '').toLowerCase() || '.jpg';
  const nombreArchivo = `evento_${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(nombreArchivo, buffer, {
      contentType: mimetype || 'image/jpeg',
      upsert: false
    });

  if (error) {
    throw new Error(`No se pudo subir la imagen a Supabase Storage: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(nombreArchivo);
  return data.publicUrl;
}

module.exports = { subirImagenEvento, BUCKET };

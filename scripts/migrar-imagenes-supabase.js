// ============================================================
// Migra las imágenes de eventos que quedaron guardadas en disco local
// (uploads/eventos/, del sistema anterior a disco/SQL Server) hacia
// Supabase Storage, y actualiza Evento.imagen_url con la nueva URL
// pública. Es un script de UNA SOLA VEZ — después de correrlo, todas las
// imágenes nuevas ya se suben directo a Supabase (ver
// src/config/supabaseStorage.js), así que no hace falta volver a correrlo.
//
// USO:
//   DATABASE_URL=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/migrar-imagenes-supabase.js
// ============================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { subirImagenEvento } = require('../src/config/supabaseStorage');

const CARPETA_LOCAL = path.join(__dirname, '..', 'uploads', 'eventos');

async function main() {
  if (!fs.existsSync(CARPETA_LOCAL)) {
    console.log('No existe la carpeta uploads/eventos — nada que migrar.');
    return;
  }

  const useSSL = process.env.DB_SSL !== 'false';
  const client = process.env.DATABASE_URL
    ? new Client({ connectionString: process.env.DATABASE_URL, ssl: useSSL ? { rejectUnauthorized: false } : false })
    : new Client({
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_DATABASE || 'greenunitydb',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        port: parseInt(process.env.DB_PORT || '5432'),
        ssl: useSSL ? { rejectUnauthorized: false } : false
      });

  await client.connect();

  // Solo interesan los eventos cuya imagen sigue apuntando a una ruta local
  const { rows: eventos } = await client.query(
    `SELECT id_evento, imagen_url FROM Evento WHERE imagen_url LIKE '/uploads/%'`
  );

  console.log(`Eventos con imagen local por migrar: ${eventos.length}`);

  let migrados = 0;
  let saltados = 0;

  for (const ev of eventos) {
    const nombreArchivo = path.basename(ev.imagen_url);
    const rutaLocal = path.join(CARPETA_LOCAL, nombreArchivo);

    if (!fs.existsSync(rutaLocal)) {
      console.warn(`⚠️  Evento ${ev.id_evento}: no se encontró ${rutaLocal}, se omite`);
      saltados++;
      continue;
    }

    const buffer = fs.readFileSync(rutaLocal);
    const ext = path.extname(nombreArchivo).toLowerCase();
    const mimetype = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

    try {
      const nuevaUrl = await subirImagenEvento(buffer, nombreArchivo, mimetype);
      await client.query('UPDATE Evento SET imagen_url = $1 WHERE id_evento = $2', [nuevaUrl, ev.id_evento]);
      console.log(`✅ Evento ${ev.id_evento}: ${nombreArchivo} → ${nuevaUrl}`);
      migrados++;
    } catch (err) {
      console.error(`❌ Evento ${ev.id_evento}: ${err.message}`);
      saltados++;
    }
  }

  console.log(`\nListo. Migrados: ${migrados} — Omitidos: ${saltados}`);
  await client.end();
}

main().catch((err) => {
  console.error('Error en la migración:', err.message);
  process.exit(1);
});

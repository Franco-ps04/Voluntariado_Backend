const { Pool } = require('pg');
require('dotenv').config();

/**
 * Configuración de conexión a PostgreSQL.
 *
 * Soporta dos formas de configurar la conexión (se usa la que esté presente):
 *  1) DATABASE_URL: cadena de conexión completa. Es la forma recomendada
 *     para Supabase y Render (Render la inyecta automáticamente si usas su
 *     Postgres administrado; Supabase la provee en Project Settings > Database).
 *     Ejemplo: postgresql://usuario:password@host:5432/postgres
 *  2) Variables sueltas: DB_HOST, DB_DATABASE, DB_USER, DB_PASSWORD, DB_PORT.
 *
 * SSL: Supabase y Render requieren SSL. Se activa automáticamente salvo que
 * DB_SSL=false (útil para una PostgreSQL local en desarrollo).
 */

const useSSL = process.env.DB_SSL !== 'false';

const connectionConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: useSSL ? { rejectUnauthorized: false } : false
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_DATABASE || 'greenunitydb',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      port: parseInt(process.env.DB_PORT || '5432'),
      ssl: useSSL ? { rejectUnauthorized: false } : false
    };

// Pool reutiliza conexiones en vez de abrir una nueva por cada query
const pool = new Pool(connectionConfig);

pool.on('error', (err) => {
  console.error('❌ Error inesperado en el pool de PostgreSQL:', err.message);
});

async function verificarConexion() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    console.log('✅ Conectado a PostgreSQL');
  } finally {
    client.release();
  }
}

/**
 * Ejecuta una consulta parametrizada.
 * @param {string} text - Consulta SQL con placeholders $1, $2, ...
 * @param {Array} params - Valores para los placeholders
 */
function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query, verificarConexion };

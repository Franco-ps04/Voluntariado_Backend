// ============================================================
// Crea el primer usuario ADMIN directamente en la base de datos.
// Necesario porque /api/auth/register solo crea voluntarios (por diseño,
// igual que en el sistema original: promover a alguien a admin/organizador
// se hace desde el panel de administración, y el primer admin no existe
// todavía).
//
// USO:
//   DATABASE_URL=... node scripts/seed-admin.js "Nombre Admin" admin@correo.com "Clave123" 987654321
// ============================================================
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

async function main() {
  const [nombre, email, password, telefono] = process.argv.slice(2);
  if (!nombre || !email || !password || !telefono) {
    console.error('Uso: node scripts/seed-admin.js "Nombre" correo@ejemplo.com "Contraseña123" 987654321');
    process.exit(1);
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

  const existe = await client.query('SELECT id_usuario FROM Usuario WHERE email = $1', [email]);
  if (existe.rows.length > 0) {
    console.error(`Ya existe un usuario con el correo ${email}`);
    await client.end();
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);
  const result = await client.query(
    `INSERT INTO Usuario (nombre, email, contrasena, telefono, rol)
     VALUES ($1, $2, $3, $4, 'admin')
     RETURNING id_usuario`,
    [nombre, email, hash, telefono]
  );
  const idUsuario = result.rows[0].id_usuario;
  await client.query('INSERT INTO Administrador (id_usuario) VALUES ($1)', [idUsuario]);

  console.log(`✅ Admin creado: ${email} (id_usuario=${idUsuario})`);
  await client.end();
}

main().catch((err) => {
  console.error('Error creando admin:', err.message);
  process.exit(1);
});

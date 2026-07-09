require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { verificarConexion } = require('./config/db');

const app = express();

// CORS: por defecto permite Angular en localhost:4200 (desarrollo).
// En producción (Render) define CORS_ORIGIN con el dominio del frontend,
// separado por comas si hay más de uno.
// Ej: CORS_ORIGIN=https://tu-app.vercel.app,http://localhost:4200
const origenesPermitidos = (process.env.CORS_ORIGIN || 'http://localhost:4200')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

app.use(cors({
    origin: origenesPermitidos,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parsear JSON en el body
app.use(express.json());

// Sirve imágenes ANTIGUAS que ya estaban en disco (uploads/eventos) antes
// de migrar a Supabase Storage. Las imágenes NUEVAS ya no se guardan aquí:
// se suben directo a Supabase Storage y su URL pública queda en
// Evento.imagen_url. Ver scripts/migrar-imagenes-supabase.js para pasar
// las imágenes antiguas al bucket.
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Registro de todas las rutas
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/eventos', require('./routes/eventos.routes'));
app.use('/api/inscripciones', require('./routes/inscripciones.routes'));
app.use('/api/asistencia', require('./routes/asistencia.routes'));
app.use('/api/mensajes', require('./routes/mensajes.routes'));
app.use('/api/contacto', require('./routes/contacto.routes'));
app.use('/api/notificaciones', require('./routes/notificaciones.routes'));
app.use('/api/usuarios', require('./routes/usuarios.routes'));
app.use('/api/certificados', require('./routes/certificados.routes'));
app.use('/api/reportes', require('./routes/reportes.routes'));

// Ruta de prueba
app.get('/api/ping', (req, res) => res.json({ ok: true, mensaje: 'GreenUnity API activa' }));

// Manejo global de errores
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(500).json({ message: 'Error interno del servidor' });
});

// Arrancar servidor
const PORT = process.env.PORT || 3000;
verificarConexion()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Servidor corriendo en http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error('❌ No se pudo conectar a PostgreSQL:', err.message);
        process.exit(1);
    });

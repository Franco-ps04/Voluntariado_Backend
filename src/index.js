require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getPool } = require('./database/db');

const app = express();

// CORS: permite peticiones desde Angular en localhost:4200
app.use(cors({
    origin: 'http://localhost:4200',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

//Parsear JSON en el body
app.use(express.json());

// Servir imágenes subidas (carpeta uploads/)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

//Registro de todas las rutas
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/eventos', require('./routes/eventos.routes'));
app.use('/api/inscripciones', require('./routes/inscripciones.routes'));
app.use('/api/asistencia', require('./routes/asistencia.routes'));
app.use('/api/mensajes', require('./routes/mensajes.routes'));
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

// ── Arrancar servidor ──────────────────────────────────────
const PORT = process.env.PORT || 3000;
getPool()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Servidor corriendo en http://localhost:${PORT}`);
        });
    })
    .catch(err => {
        console.error('❌ No se pudo conectar a SQL Server:', err.message);
        process.exit(1);
    });
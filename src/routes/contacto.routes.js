const router = require('express').Router();
const { sql, getPool } = require('../database/db');
const nodemailer = require('nodemailer');

function validarEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? '').trim());
}

function soloDigitos(value) {
    return String(value ?? '').replace(/\D/g, '');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function crearTransporter() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
        return null;
    }

    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass }
    });
}

function crearCuerpoCorreo({ nombre, telefono, email, asunto, mensaje }) {
    return `
    <h2>Nuevo mensaje desde el formulario de contacto</h2>
    <p><strong>Nombre:</strong> ${escapeHtml(nombre)}</p>
    <p><strong>Teléfono:</strong> ${escapeHtml(telefono || 'No indicado')}</p>
    <p><strong>Correo:</strong> ${escapeHtml(email)}</p>
    <p><strong>Asunto:</strong> ${escapeHtml(asunto)}</p>
    <p><strong>Mensaje:</strong></p>
    <p style="white-space:pre-line">${escapeHtml(mensaje)}</p>
  `;
}

router.post('/', async (req, res) => {
    const nombre = String(req.body.nombre ?? '').trim();
    const telefono = soloDigitos(req.body.telefono);
    const email = String(req.body.email ?? '').trim();
    const asunto = String(req.body.asunto ?? '').trim();
    const mensaje = String(req.body.mensaje ?? '').trim();

    if (!nombre || nombre.length < 3) {
        return res.status(400).json({ message: 'El nombre es obligatorio' });
    }
    if (!telefono || telefono.length !== 9) {
        return res.status(400).json({ message: 'El teléfono debe tener 9 dígitos' });
    }
    if (!email || !validarEmail(email)) {
        return res.status(400).json({ message: 'El correo electrónico no es válido' });
    }
    if (!asunto) {
        return res.status(400).json({ message: 'El asunto es obligatorio' });
    }
    if (!mensaje || mensaje.length < 10) {
        return res.status(400).json({ message: 'El mensaje debe tener al menos 10 caracteres' });
    }
    if (asunto.length > 150) {
        return res.status(400).json({ message: 'El asunto no debe superar 150 caracteres' });
    }
    if (mensaje.length > 2000) {
        return res.status(400).json({ message: 'El mensaje no debe superar 2000 caracteres' });
    }

    try {
        const pool = await getPool();

        const insert = await pool.request()
            .input('nombre', sql.NVarChar(100), nombre)
            .input('telefono', sql.NVarChar(9), telefono)
            .input('email', sql.NVarChar(100), email)
            .input('asunto', sql.NVarChar(150), asunto)
            .input('mensaje', sql.NVarChar(sql.MAX), mensaje)
            .query(`
        DECLARE @Ids TABLE (id_contacto INT);

        INSERT INTO Contacto (nombre, telefono, email, asunto, mensaje)
        OUTPUT INSERTED.id_contacto INTO @Ids
        VALUES (@nombre, @telefono, @email, @asunto, @mensaje);

        SELECT TOP 1 id_contacto FROM @Ids;
      `);

        const idContacto = insert.recordset[0]?.id_contacto ?? null;
        const transporter = crearTransporter();
        const destino = process.env.CONTACT_EMAIL || process.env.CONTACTO_DESTINO_EMAIL || process.env.SMTP_USER;

        if (!destino) {
            return res.status(500).json({
                message: 'Falta definir el correo destino en CONTACT_EMAIL'
            });
        }

        if (!transporter) {
            return res.status(500).json({
                message: 'Falta configurar SMTP_HOST, SMTP_PORT, SMTP_USER o SMTP_PASS'
            });
        }

        //const replyAddress = { name: nombre, address: email.trim() };
        await transporter.sendMail({
            from: `"GreenUnity" <${process.env.SMTP_USER}>`,
            to: destino,
            replyTo: `${nombre} <${email.trim()}>`,
            subject: `[Contacto] ${asunto}`,
            html: crearCuerpoCorreo({ nombre, telefono, email, asunto, mensaje }),
            text: `Nombre: ${nombre}\nTeléfono: ${telefono || 'No indicado'}\nCorreo: ${email}\nAsunto: ${asunto}\n\nMensaje:\n${mensaje}`
        });

        return res.status(201).json({
            ok: true,
            id: idContacto,
            mailSent: true,
            message: 'Mensaje enviado correctamente'
        });
    } catch (err) {
        return res.status(500).json({
            message: err.message || 'No se pudo enviar el mensaje de contacto'
        });
    }
});

module.exports = router;
const contactoDAO = require('../dao/ContactoDAO');
const { soloDigitos, validarEmail } = require('../utils/validators');
const { crearTransporter, crearCuerpoCorreoContacto } = require('../utils/mailer');

// POST /api/contacto
async function enviar(req, res) {
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
    const idContacto = await contactoDAO.crear({ nombre, telefono, email, asunto, mensaje });

    const transporter = crearTransporter();
    const destino = process.env.CONTACT_EMAIL || process.env.CONTACTO_DESTINO_EMAIL || process.env.SMTP_USER;

    if (!destino) {
      return res.status(500).json({ message: 'Falta definir el correo destino en CONTACT_EMAIL' });
    }
    if (!transporter) {
      return res.status(500).json({ message: 'Falta configurar SMTP_HOST, SMTP_PORT, SMTP_USER o SMTP_PASS' });
    }

    await transporter.sendMail({
      from: `"GreenUnity" <${process.env.SMTP_USER}>`,
      to: destino,
      replyTo: `${nombre} <${email.trim()}>`,
      subject: `[Contacto] ${asunto}`,
      html: crearCuerpoCorreoContacto({ nombre, telefono, email, asunto, mensaje }),
      text: `Nombre: ${nombre}\nTeléfono: ${telefono || 'No indicado'}\nCorreo: ${email}\nAsunto: ${asunto}\n\nMensaje:\n${mensaje}`
    });

    return res.status(201).json({
      ok: true,
      id: idContacto,
      mailSent: true,
      message: 'Mensaje enviado correctamente'
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'No se pudo enviar el mensaje de contacto' });
  }
}

module.exports = { enviar };

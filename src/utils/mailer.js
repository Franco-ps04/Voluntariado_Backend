const nodemailer = require('nodemailer');

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

function crearCuerpoCorreoContacto({ nombre, telefono, email, asunto, mensaje }) {
  const replySubject = `Razón: ${asunto}`;
  const mailtoHref = `mailto:${email.trim()}?subject=${encodeURIComponent(replySubject)}`;

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
      <h2 style="margin:0 0 16px">Nuevo mensaje desde el formulario de contacto</h2>
      <p><strong>Nombre:</strong> ${escapeHtml(nombre)}</p>
      <p><strong>Teléfono:</strong> ${escapeHtml(telefono || 'No indicado')}</p>
      <p><strong>Correo:</strong> ${escapeHtml(email)}</p>
      <p><strong>Asunto:</strong> ${escapeHtml(asunto)}</p>
      <p><strong>Mensaje:</strong></p>
      <p style="white-space:pre-line">${escapeHtml(mensaje)}</p>

      <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb">

      <p style="margin:0 0 12px;color:#4b5563">Haz clic para responder directamente al correo del usuario.</p>
      <a href="${mailtoHref}"
         style="display:inline-block;background:#2d9e5f;color:#fff;text-decoration:none;
                padding:12px 18px;border-radius:8px;font-weight:700">
        Responder al usuario
      </a>
    </div>
  `;
}

module.exports = { crearTransporter, crearCuerpoCorreoContacto, escapeHtml };

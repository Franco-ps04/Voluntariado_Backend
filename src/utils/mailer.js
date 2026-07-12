// Render (plan gratuito) bloquea el tráfico saliente a los puertos SMTP
// (25, 465, 587) desde el 26/09/2025. Por eso NO usamos nodemailer con
// SMTP directo: usamos la API HTTP de Resend (https://resend.com), que
// viaja por el puerto 443 (HTTPS), el mismo que usa el resto de la app,
// y que Render no bloquea. No requiere ninguna librería adicional: el
// `fetch` nativo de Node ya es suficiente.
const RESEND_API_URL = 'https://api.resend.com/emails';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Envía un correo a través de la API de Resend.
 * Requiere la variable de entorno RESEND_API_KEY (se obtiene gratis en
 * https://resend.com/api-keys). Lanza un Error si falta la clave o si
 * Resend responde con un error, para que el controlador lo capture.
 */
async function enviarCorreo({ from, to, subject, html, text, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Falta configurar RESEND_API_KEY');
  }

  const respuesta = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      reply_to: replyTo
    })
  });

  if (!respuesta.ok) {
    let detalle = '';
    try {
      const cuerpo = await respuesta.json();
      detalle = cuerpo?.message || JSON.stringify(cuerpo);
    } catch (_) {
      detalle = await respuesta.text().catch(() => '');
    }
    throw new Error(`Resend respondió ${respuesta.status}: ${detalle || 'error desconocido'}`);
  }

  return respuesta.json();
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

module.exports = { enviarCorreo, crearCuerpoCorreoContacto, escapeHtml };

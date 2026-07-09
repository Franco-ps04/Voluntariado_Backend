function soloDigitos(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? '').trim());
}

function validarPassword(password) {
  const raw = String(password ?? '');
  return raw.length >= 8 && /[A-Za-z]/.test(raw) && /\d/.test(raw);
}

function estadoKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function conteoPalabras(texto) {
  return String(texto ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

module.exports = { soloDigitos, validarEmail, validarPassword, estadoKey, conteoPalabras };

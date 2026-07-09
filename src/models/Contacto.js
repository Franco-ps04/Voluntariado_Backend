class Contacto {
  constructor({ id_contacto, nombre, telefono, email, asunto, mensaje, fecha, leido }) {
    this.id_contacto = id_contacto;
    this.nombre = nombre;
    this.telefono = telefono;
    this.email = email;
    this.asunto = asunto;
    this.mensaje = mensaje;
    this.fecha = fecha;
    this.leido = leido;
  }
}

module.exports = Contacto;

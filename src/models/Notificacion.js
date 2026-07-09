class Notificacion {
  constructor({ id_notificacion, titulo, mensaje, fecha, id_usuario, id_evento }) {
    this.id_notificacion = id_notificacion;
    this.titulo = titulo;
    this.mensaje = mensaje;
    this.fecha = fecha;
    this.id_usuario = id_usuario;
    this.id_evento = id_evento;
  }
}

module.exports = Notificacion;

class Mensaje {
  constructor({
    id_mensaje, asunto, mensaje, fecha, leido, leido_por_voluntario,
    respondido, id_voluntario, id_usuario_destino, id_evento
  }) {
    this.id_mensaje = id_mensaje;
    this.asunto = asunto;
    this.mensaje = mensaje;
    this.fecha = fecha;
    this.leido = leido;
    this.leido_por_voluntario = leido_por_voluntario;
    this.respondido = respondido;
    this.id_voluntario = id_voluntario;
    this.id_usuario_destino = id_usuario_destino;
    this.id_evento = id_evento;
  }
}

module.exports = Mensaje;

class Evento {
  constructor({
    id_evento, nombre, descripcion, fecha, hora, ubicacion, capacidad,
    inscritos, estado, archivado, latitud, longitud, imagen_url,
    id_tipo, id_organizador
  }) {
    this.id_evento = id_evento;
    this.nombre = nombre;
    this.descripcion = descripcion;
    this.fecha = fecha;
    this.hora = hora;
    this.ubicacion = ubicacion;
    this.capacidad = capacidad;
    this.inscritos = inscritos;
    this.estado = estado; // 'Próximo' | 'En curso' | 'Finalizado' | 'Cancelado'
    this.archivado = archivado;
    this.latitud = latitud;
    this.longitud = longitud;
    this.imagen_url = imagen_url;
    this.id_tipo = id_tipo;
    this.id_organizador = id_organizador;
  }

  static estadosValidos() {
    return ['Próximo', 'En curso', 'Finalizado', 'Cancelado'];
  }
}

module.exports = Evento;

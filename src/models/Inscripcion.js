class Inscripcion {
  constructor({ id_inscripcion, fecha_inscripcion, estado, id_voluntario, id_evento }) {
    this.id_inscripcion = id_inscripcion;
    this.fecha_inscripcion = fecha_inscripcion;
    this.estado = estado; // 'Próximo' | 'Finalizado' | 'Cancelado'
    this.id_voluntario = id_voluntario;
    this.id_evento = id_evento;
  }
}

module.exports = Inscripcion;

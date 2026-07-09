class Asistencia {
  constructor({ id_asistencia, id_inscripcion, asistio, fecha_registro }) {
    this.id_asistencia = id_asistencia;
    this.id_inscripcion = id_inscripcion;
    this.asistio = asistio;
    this.fecha_registro = fecha_registro;
  }
}

module.exports = Asistencia;

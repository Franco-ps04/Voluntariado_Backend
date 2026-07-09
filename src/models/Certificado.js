class Certificado {
  constructor({
    id_certificado, titulo, motivo, color, cantidad_participacion,
    fecha_emision, archivo_url, id_voluntario, id_config
  }) {
    this.id_certificado = id_certificado;
    this.titulo = titulo;
    this.motivo = motivo;
    this.color = color;
    this.cantidad_participacion = cantidad_participacion;
    this.fecha_emision = fecha_emision;
    this.archivo_url = archivo_url;
    this.id_voluntario = id_voluntario;
    this.id_config = id_config;
  }
}

module.exports = Certificado;

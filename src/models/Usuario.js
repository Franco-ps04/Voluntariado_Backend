/**
 * Modelo de dominio: Usuario
 * Representa la fila de la tabla Usuario. No contiene SQL ni lógica HTTP
 * (SRP): solo define la forma de la entidad y validaciones de forma simples.
 */
class Usuario {
  constructor({ id_usuario, nombre, email, contrasena, telefono, rol, activo, creado_en }) {
    this.id_usuario = id_usuario;
    this.nombre = nombre;
    this.email = email;
    this.contrasena = contrasena; // hash bcrypt
    this.telefono = telefono;
    this.rol = rol; // 'voluntario' | 'admin' | 'organizador'
    this.activo = activo;
    this.creado_en = creado_en;
  }

  static rolesValidos() {
    return ['voluntario', 'admin', 'organizador'];
  }
}

module.exports = Usuario;

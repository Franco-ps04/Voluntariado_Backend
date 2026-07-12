const usuarioDAO = require('../dao/UsuarioDAO');
const organizadorDAO = require('../dao/OrganizadorDAO');
const eventoDAO = require('../dao/EventoDAO');
const inscripcionDAO = require('../dao/InscripcionDAO');
const asistenciaDAO = require('../dao/AsistenciaDAO');
const mensajeDAO = require('../dao/MensajeDAO');
const notificacionDAO = require('../dao/NotificacionDAO');
const { generarExcelUsuarios, generarPdfUsuarios } = require('../utils/exportUsuarios');

// Limpia los datos afectados al suspender una cuenta:
//  - voluntario: libera (elimina) sus inscripciones a eventos aún no
//    finalizados/cancelados, ajustando el contador de inscritos. El
//    historial de eventos ya finalizados se conserva intacto.
//  - organizador/admin: elimina por completo los eventos que aún no
//    empezaron (y sus mensajes, notificaciones, asistencias e
//    inscripciones asociadas), ya que sin el organizador esos eventos no
//    pueden llevarse a cabo.
async function limpiarDatosUsuarioSuspendido(idUsuario, rol) {
  const normalizado = String(rol ?? '').trim().toLowerCase();

  if (normalizado === 'voluntario') {
    await inscripcionDAO.eliminarActivasPorVoluntarioConAjusteInscritos(idUsuario);
    return;
  }

  if (normalizado === 'organizador' || normalizado === 'admin') {
    const org = await organizadorDAO.findByUsuarioId(idUsuario);
    if (!org) return;

    const eventos = await eventoDAO.findActivosPorOrganizador(org.id_organizador);

    for (const idEvento of eventos) {
      await mensajeDAO.eliminarPorEvento(idEvento);
      await notificacionDAO.eliminarPorEvento(idEvento);
      await asistenciaDAO.eliminarPorEvento(idEvento);
      await inscripcionDAO.eliminarPorEvento(idEvento);
      await eventoDAO.eliminarFisico(idEvento);
    }
  }
}

// GET /api/usuarios
// Query params: ?rol=voluntario&buscar=juan
async function listar(req, res) {
  try {
    const data = await usuarioDAO.listar({ rol: req.query.rol, buscar: req.query.buscar });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/usuarios/destinatarios-activos
async function destinatariosActivos(req, res) {
  try {
    const data = await usuarioDAO.findDestinatariosActivos();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/usuarios/:id
async function obtener(req, res) {
  try {
    const usuario = await usuarioDAO.findConOrganizacion(req.params.id);
    if (!usuario)
      return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json(usuario);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// PUT /api/usuarios/:id
// Body: { nombre, email, telefono, rol, nombre_organizacion }
async function actualizar(req, res) {
  const { nombre, email, telefono, rol, nombre_organizacion } = req.body;
  if (!nombre || !email || !telefono || !rol)
    return res.status(400).json({ message: 'Faltan campos obligatorios' });

  if (rol === 'organizador' && !String(nombre_organizacion ?? '').trim()) {
    return res.status(400).json({ message: 'La organización es obligatoria para un organizador' });
  }

  const rolesValidos = ['voluntario', 'admin', 'organizador'];
  if (!rolesValidos.includes(rol))
    return res.status(400).json({ message: 'Rol inválido' });

  try {
    const rolAnterior = await usuarioDAO.findRolById(req.params.id);
    const promovido = (rolAnterior === 'voluntario' && (rol === 'admin' || rol === 'organizador'));

    await usuarioDAO.actualizar(req.params.id, { nombre, email, telefono, rol });

    if (rol === 'organizador') {
      await organizadorDAO.upsert(req.params.id, nombre_organizacion);
    } else {
      await organizadorDAO.eliminarPorUsuario(req.params.id);
    }

    if (promovido) {
      await inscripcionDAO.cancelarTodasActivasPorVoluntario(req.params.id);
      await asistenciaDAO.eliminarPorVoluntario(req.params.id);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// PATCH /api/usuarios/:id/estado
// Body: { activo: true | false }
async function cambiarEstado(req, res) {
  if (typeof req.body.activo !== 'boolean')
    return res.status(400).json({ message: 'activo debe ser true o false' });

  try {
    const rolActual = await usuarioDAO.findRolById(req.params.id);

    if (req.body.activo === false && rolActual) {
      await limpiarDatosUsuarioSuspendido(Number(req.params.id), rolActual);
    }

    await usuarioDAO.actualizarEstado(req.params.id, req.body.activo);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// PATCH /api/usuarios/mi-perfil
async function miPerfil(req, res) {
  const { nombre, telefono } = req.body;
  try {
    await usuarioDAO.actualizarPerfil(req.usuario.id, { nombre, telefono });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/usuarios/exportar?formato=xlsx|pdf&id=<opcional>&rol=<opcional>&buscar=<opcional>
// Sin "id": exporta el listado completo (respetando rol/buscar si se envían).
// Con "id": exporta solo ese usuario (respaldo puntual, ej. antes de suspenderlo).
async function exportar(req, res) {
  const formato = String(req.query.formato ?? '').toLowerCase();
  if (!['xlsx', 'pdf'].includes(formato)) {
    return res.status(400).json({ message: 'El formato debe ser "xlsx" o "pdf"' });
  }

  try {
    let usuarios;
    let titulo;

    if (req.query.id) {
      const usuario = await usuarioDAO.findConOrganizacion(req.query.id);
      if (!usuario) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
      }
      usuarios = [usuario];
      titulo = `Usuario - ${usuario.nombre}`;
    } else {
      usuarios = await usuarioDAO.listar({ rol: req.query.rol, buscar: req.query.buscar });
      titulo = 'Listado de usuarios';
    }

    const nombreArchivoBase = req.query.id
      ? `usuario_${req.query.id}`
      : `usuarios_${new Date().toISOString().slice(0, 10)}`;

    if (formato === 'xlsx') {
      const buffer = await generarExcelUsuarios(usuarios, titulo);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivoBase}.xlsx"`);
      return res.send(buffer);
    }

    const buffer = await generarPdfUsuarios(usuarios, titulo);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivoBase}.pdf"`);
    return res.send(buffer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { listar, destinatariosActivos, obtener, actualizar, cambiarEstado, miPerfil, exportar };

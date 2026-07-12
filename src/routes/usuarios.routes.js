const router = require('express').Router();
const auth = require('../middlewares/auth');
const soloRoles = require('../middlewares/roles');
const usuariosController = require('../controllers/usuarios.controller');

router.get('/', auth, soloRoles('admin'), usuariosController.listar);

// Debe ir antes de /:id
router.get('/destinatarios-activos', auth, soloRoles('voluntario'), usuariosController.destinatariosActivos);
router.get('/exportar', auth, soloRoles('admin'), usuariosController.exportar);

router.get('/:id', auth, soloRoles('admin'), usuariosController.obtener);
router.put('/:id', auth, soloRoles('admin'), usuariosController.actualizar);
router.patch('/:id/estado', auth, soloRoles('admin'), usuariosController.cambiarEstado);
router.patch('/mi-perfil', auth, usuariosController.miPerfil);

module.exports = router;

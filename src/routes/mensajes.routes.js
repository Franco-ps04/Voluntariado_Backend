const router = require('express').Router();
const auth = require('../middlewares/auth');
const soloRoles = require('../middlewares/roles');
const mensajesController = require('../controllers/mensajes.controller');

router.get('/destinatarios', auth, soloRoles('voluntario'), mensajesController.destinatarios);
router.get('/mis', auth, soloRoles('voluntario'), mensajesController.misMensajes);
router.post('/', auth, soloRoles('voluntario'), mensajesController.crear);
router.post('/:id/seguimiento', auth, soloRoles('voluntario'), mensajesController.seguimiento);
router.patch('/:id/leido', auth, soloRoles('voluntario'), mensajesController.marcarLeidoVoluntario);

router.get('/panel', auth, soloRoles('admin', 'organizador'), mensajesController.panel);
router.patch('/:id/marcar-leido', auth, soloRoles('admin', 'organizador'), mensajesController.marcarLeidoAdmin);
router.post('/:id/responder', auth, soloRoles('admin', 'organizador'), mensajesController.responder);

module.exports = router;

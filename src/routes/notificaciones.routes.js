const router = require('express').Router();
const auth = require('../middlewares/auth');
const soloRoles = require('../middlewares/roles');
const notificacionesController = require('../controllers/notificaciones.controller');

router.get('/mis', auth, soloRoles('voluntario'), notificacionesController.misNotificaciones);
router.patch('/:id/leida', auth, soloRoles('voluntario'), notificacionesController.marcarLeida);
router.post('/', auth, soloRoles('admin', 'organizador'), notificacionesController.crear);
router.get('/', auth, soloRoles('admin', 'organizador'), notificacionesController.listarEnviadas);

module.exports = router;

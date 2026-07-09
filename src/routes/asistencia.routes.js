const router = require('express').Router();
const auth = require('../middlewares/auth');
const soloRoles = require('../middlewares/roles');
const asistenciaController = require('../controllers/asistencia.controller');

router.get('/:eventoId', auth, soloRoles('admin', 'organizador'), asistenciaController.listarPorEvento);
router.put('/:inscripcionId', auth, soloRoles('admin', 'organizador'), asistenciaController.registrar);

module.exports = router;

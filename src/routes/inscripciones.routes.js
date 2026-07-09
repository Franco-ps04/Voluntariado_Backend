const router = require('express').Router();
const auth = require('../middlewares/auth');
const soloRoles = require('../middlewares/roles');
const inscripcionesController = require('../controllers/inscripciones.controller');

router.get('/mis', auth, soloRoles('voluntario'), inscripcionesController.misInscripciones);
router.get('/', auth, soloRoles('admin', 'organizador'), inscripcionesController.inscritosDeEvento);
router.post('/', auth, soloRoles('voluntario'), inscripcionesController.inscribirse);
router.patch('/:id/cancelar', auth, soloRoles('voluntario'), inscripcionesController.cancelar);

module.exports = router;

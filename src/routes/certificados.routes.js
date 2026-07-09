const router = require('express').Router();
const auth = require('../middlewares/auth');
const soloRoles = require('../middlewares/roles');
const certificadosController = require('../controllers/certificados.controller');

router.get('/mis', auth, soloRoles('voluntario'), certificadosController.misCertificados);
router.get('/', auth, soloRoles('admin'), certificadosController.listarTodos);
router.post('/verificar/:idVoluntario', auth, soloRoles('admin'), certificadosController.verificar);

module.exports = router;

const router = require('express').Router();
const auth = require('../middlewares/auth');
const soloRoles = require('../middlewares/roles');
const reportesController = require('../controllers/reportes.controller');

router.get('/resumen', auth, soloRoles('admin', 'organizador'), reportesController.resumen);

module.exports = router;

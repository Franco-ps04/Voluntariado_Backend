const router = require('express').Router();
const auth = require('../middlewares/auth');
const soloRoles = require('../middlewares/roles');
const { uploadEvento } = require('../config/upload');
const eventosController = require('../controllers/eventos.controller');

// GET /api/eventos
router.get('/', eventosController.listar);

// GET /api/eventos/gestion (debe ir antes de /:id)
router.get('/gestion', auth, soloRoles('admin', 'organizador'), eventosController.listarGestion);

// GET /api/eventos/organizadores/lista (debe ir antes de /:id)
router.get('/organizadores/lista', auth, soloRoles('admin'), eventosController.listarOrganizadores);

// GET /api/eventos/:id
router.get('/:id', eventosController.obtener);

// POST /api/eventos
router.post(
  '/',
  auth,
  soloRoles('admin', 'organizador'),
  uploadEvento.single('imagen'),
  eventosController.crear
);

// PUT /api/eventos/:id
router.put(
  '/:id',
  auth,
  soloRoles('admin', 'organizador'),
  uploadEvento.single('imagen'),
  eventosController.actualizar
);

// PATCH /api/eventos/:id/estado
router.patch('/:id/estado', auth, soloRoles('admin', 'organizador'), eventosController.cambiarEstado);

// DELETE /api/eventos/:id
router.delete('/:id', auth, soloRoles('admin', 'organizador'), eventosController.archivar);

module.exports = router;

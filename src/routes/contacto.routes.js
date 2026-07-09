const router = require('express').Router();
const contactoController = require('../controllers/contacto.controller');

router.post('/', contactoController.enviar);

module.exports = router;

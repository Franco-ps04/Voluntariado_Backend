const router = require('express').Router();
const auth = require('../middlewares/auth');
const authController = require('../controllers/auth.controller');

router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/recuperar-contrasena', authController.recuperarContrasena);
router.get('/me', auth, authController.me);

module.exports = router;
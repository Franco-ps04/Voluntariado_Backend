function soloRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario?.rol))
      return res.status(403).json({ message: 'Sin permisos suficientes' });
    next();
  };
}

module.exports = soloRoles;
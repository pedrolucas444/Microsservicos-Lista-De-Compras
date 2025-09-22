const jwt = require('jsonwebtoken');
const SECRET = "segredo123"; // mantenha o mesmo do user-service

module.exports = function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: "Token não enviado" });

  const parts = header.split(" ");
  if (parts.length !== 2) return res.status(401).json({ error: "Formato inválido" });

  const token = parts[1];
  try {
    const decoded = jwt.verify(token, SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido" });
  }
};
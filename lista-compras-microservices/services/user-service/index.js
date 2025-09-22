const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const JsonDatabase = require("../../shared/JsonDatabase");
const registry = require("../../shared/serviceRegistry");
const authMiddleware = require("../../shared/authMiddleware");

const app = express();
app.use(express.json());

const usersDb = new JsonDatabase("users.json");
const SECRET = "segredo123";

// Registro
app.post("/auth/register", (req, res) => {
  const { email, username, password } = req.body;
  const users = usersDb.read();

  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: "Email já registrado" });
  }

  const hashed = bcrypt.hashSync(password, 10);
  const newUser = {
    id: uuidv4(),
    email,
    username,
    password: hashed,
    firstName: "",
    lastName: "",
    preferences: {
      defaultStore: "",
      currency: ""
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  users.push(newUser);
  usersDb.write(users);

  res.status(201).json({ message: "Usuário registrado com sucesso" });
});

// Login
app.post("/auth/login", (req, res) => {
  const { email, password } = req.body;
  const users = usersDb.read();

  const user = users.find(u => u.email === email);
  if (!user) return res.status(400).json({ error: "Usuário não encontrado" });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ error: "Senha inválida" });

  const token = jwt.sign({ id: user.id }, SECRET, { expiresIn: "1h" });
  res.json({ token });
});

// Buscar dados do usuário (protegido)
app.get("/users/:id", authMiddleware, (req, res) => {
  const users = usersDb.read();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

  // só o próprio usuário pode ver os dados dele
  if (req.userId !== user.id) {
    return res.status(403).json({ error: "Acesso negado" });
  }

  res.json(user);
});

// Atualizar perfil do usuário (protegido)
app.put("/users/:id", authMiddleware, (req, res) => {
  const users = usersDb.read();
  const index = users.findIndex(u => u.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Usuário não encontrado" });

  if (req.userId !== users[index].id) {
    return res.status(403).json({ error: "Acesso negado" });
  }

  const updatedUser = { ...users[index], ...req.body, updatedAt: Date.now() };
  users[index] = updatedUser;
  usersDb.write(users);

  res.json({ message: "Usuário atualizado", user: updatedUser });
});

const PORT = 3001;
app.listen(PORT, () => {
  registry.register("user-service", "localhost", PORT);
  console.log(`User Service rodando em http://localhost:${PORT}`);
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "user-service" }); 
});

process.on('SIGINT', () => {
  registry.unregister('user-service');
  process.exit();
});
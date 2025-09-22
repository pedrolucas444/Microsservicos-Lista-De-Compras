const express = require("express");
const { v4: uuidv4 } = require("uuid");
const JsonDatabase = require("../../shared/JsonDatabase");
const registry = require("../../shared/serviceRegistry");
const authMiddleware = require("../../shared/authMiddleware");


const app = express();
app.use(express.json());

const itemsDb = new JsonDatabase("items.json");

// Listar todos os itens ou com filtros
app.get("/items", (req, res) => {
  const { category, name } = req.query;
  let items = itemsDb.read();

  if (category) {
    items = items.filter(item => item.category.toLowerCase() === category.toLowerCase());
  }

  if (name) {
    items = items.filter(item => item.name.toLowerCase().includes(name.toLowerCase()));
  }

  res.json(items);
});

// Buscar item específico
app.get("/items/:id", (req, res) => {
  const items = itemsDb.read();
  const item = items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Item não encontrado" });
  res.json(item);
});

// Criar novo item
app.post("/items", (req, res) => {
  const { name, category, brand, unit, averagePrice, barcode, description } = req.body;
  const items = itemsDb.read();

  const newItem = {
    id: uuidv4(),
    name,
    category,
    brand,
    unit,
    averagePrice,
    barcode,
    description,
    active: true,
    createdAt: Date.now()
  };

  items.push(newItem);
  itemsDb.write(items);

  res.status(201).json({ message: "Item criado com sucesso", item: newItem });
});

// Atualizar item
app.put("/items/:id", (req, res) => {
  const items = itemsDb.read();
  const index = items.findIndex(i => i.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Item não encontrado" });

  const updatedItem = { ...items[index], ...req.body, updatedAt: Date.now() };
  items[index] = updatedItem;
  itemsDb.write(items);

  res.json({ message: "Item atualizado", item: updatedItem });
});

// Listar categorias disponíveis
app.get("/categories", (req, res) => {
  const items = itemsDb.read();
  const categories = [...new Set(items.map(i => i.category))];
  res.json(categories);
});

// Buscar itens por termo
app.get("/search", (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "Termo de busca obrigatório" });

  const items = itemsDb.read();
  const results = items.filter(i => i.name.toLowerCase().includes(q.toLowerCase()));
  res.json(results);
});

// Porta do serviço
const PORT = 3002;
app.listen(PORT, () => {
  registry.register("item-service", "localhost", PORT);
  console.log(`Item Service rodando em http://localhost:${PORT}`);
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "item-service" }); 
});

process.on('SIGINT', () => {
  registry.unregister('item-service');
  process.exit();
});
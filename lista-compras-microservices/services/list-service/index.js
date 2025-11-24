const express = require("express");
const { v4: uuidv4 } = require("uuid");
const JsonDatabase = require("../../shared/JsonDatabase");
const registry = require("../../shared/serviceRegistry");
const axios = require("axios");
const authMiddleware = require("../../shared/authMiddleware");
const amqplib = require('amqplib');

const app = express();
app.use(express.json());

const listsDb = new JsonDatabase("lists.json");

// Health (não protegido) - importante para o API Gateway e health checks
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'list-service' });
});

// 🔹 aplica o middleware em todas as rotas do List Service (após /health)
app.use(authMiddleware);

// Criar nova lista
app.post("/lists", (req, res) => {
  const { name, description } = req.body;
  const lists = listsDb.read();

  const newList = {
    id: uuidv4(),
    userId: req.userId, // vem do JWT decodificado
    name,
    description,
    status: "active",
    items: [],
    summary: {
      totalItems: 0,
      purchasedItems: 0,
      estimatedTotal: 0
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  lists.push(newList);
  listsDb.write(lists);

  res.status(201).json({ message: "Lista criada com sucesso", list: newList });
});

// Listar listas do usuário
app.get("/lists", (req, res) => {
  const lists = listsDb.read().filter(l => l.userId === req.userId);
  res.json(lists);
});

// Buscar lista específica
app.get("/lists/:id", (req, res) => {
  const lists = listsDb.read();
  const list = lists.find(l => l.id === req.params.id && l.userId === req.userId);
  if (!list) return res.status(404).json({ error: "Lista não encontrada" });
  res.json(list);
});

// Atualizar lista
app.put("/lists/:id", (req, res) => {
  const lists = listsDb.read();
  const index = lists.findIndex(l => l.id === req.params.id && l.userId === req.userId);
  if (index === -1) return res.status(404).json({ error: "Lista não encontrada" });

  const updatedList = { ...lists[index], ...req.body, updatedAt: Date.now() };
  lists[index] = updatedList;
  listsDb.write(lists);

  res.json({ message: "Lista atualizada", list: updatedList });
});

// Deletar lista
app.delete("/lists/:id", (req, res) => {
  const lists = listsDb.read();
  const filteredLists = lists.filter(l => !(l.id === req.params.id && l.userId === req.userId));
  listsDb.write(filteredLists);
  res.json({ message: "Lista deletada" });
});

// Adicionar item à lista (buscando dados do Item Service)
app.post("/lists/:id/items", async (req, res) => {
  const { itemId, quantity } = req.body;
  const lists = listsDb.read();
  const listIndex = lists.findIndex(l => l.id === req.params.id && l.userId === req.userId);
  if (listIndex === -1) return res.status(404).json({ error: "Lista não encontrada" });

  try {
    const itemServiceUrl = "http://localhost:3002/items";
    const itemResp = await axios.get(`${itemServiceUrl}/${itemId}`);
    const item = itemResp.data;

    const newItem = {
      itemId: item.id,
      itemName: item.name,
      quantity,
      unit: item.unit,
      estimatedPrice: quantity * item.averagePrice,
      purchased: false,
      notes: "",
      addedAt: Date.now()
    };

    lists[listIndex].items.push(newItem);

    // Atualizar resumo
    const totalItems = lists[listIndex].items.length;
    const purchasedItems = lists[listIndex].items.filter(i => i.purchased).length;
    const estimatedTotal = lists[listIndex].items.reduce((sum, i) => sum + i.estimatedPrice, 0);

    lists[listIndex].summary = { totalItems, purchasedItems, estimatedTotal };
    lists[listIndex].updatedAt = Date.now();

    listsDb.write(lists);
    res.status(201).json({ message: "Item adicionado", list: lists[listIndex] });
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar item do Item Service" });
  }
});

// Atualizar item da lista
app.put("/lists/:id/items/:itemId", (req, res) => {
  const lists = listsDb.read();
  const listIndex = lists.findIndex(l => l.id === req.params.id && l.userId === req.userId);
  if (listIndex === -1) return res.status(404).json({ error: "Lista não encontrada" });

  const itemIndex = lists[listIndex].items.findIndex(i => i.itemId === req.params.itemId);
  if (itemIndex === -1) return res.status(404).json({ error: "Item não encontrado na lista" });

  lists[listIndex].items[itemIndex] = {
    ...lists[listIndex].items[itemIndex],
    ...req.body
  };

  // Recalcular resumo
  const totalItems = lists[listIndex].items.length;
  const purchasedItems = lists[listIndex].items.filter(i => i.purchased).length;
  const estimatedTotal = lists[listIndex].items.reduce((sum, i) => sum + i.estimatedPrice, 0);
  lists[listIndex].summary = { totalItems, purchasedItems, estimatedTotal };
  lists[listIndex].updatedAt = Date.now();

  listsDb.write(lists);
  res.json({ message: "Item atualizado", list: lists[listIndex] });
});

// Remover item da lista
app.delete("/lists/:id/items/:itemId", (req, res) => {
  const lists = listsDb.read();
  const listIndex = lists.findIndex(l => l.id === req.params.id && l.userId === req.userId);
  if (listIndex === -1) return res.status(404).json({ error: "Lista não encontrada" });

  lists[listIndex].items = lists[listIndex].items.filter(i => i.itemId !== req.params.itemId);

  // Recalcular resumo
  const totalItems = lists[listIndex].items.length;
  const purchasedItems = lists[listIndex].items.filter(i => i.purchased).length;
  const estimatedTotal = lists[listIndex].items.reduce((sum, i) => sum + i.estimatedPrice, 0);
  lists[listIndex].summary = { totalItems, purchasedItems, estimatedTotal };
  lists[listIndex].updatedAt = Date.now();

  listsDb.write(lists);
  res.json({ message: "Item removido", list: lists[listIndex] });
});

// Resumo da lista
app.get("/lists/:id/summary", (req, res) => {
  const lists = listsDb.read();
  const list = lists.find(l => l.id === req.params.id && l.userId === req.userId);
  if (!list) return res.status(404).json({ error: "Lista não encontrada" });
  res.json(list.summary);
});

// Checkout assíncrono: publica evento e retorna 202
app.post('/lists/:id/checkout', async (req, res) => {
  const lists = listsDb.read();
  const listIndex = lists.findIndex(l => l.id === req.params.id && l.userId === req.userId);
  if (listIndex === -1) return res.status(404).json({ error: 'Lista não encontrada' });

  const list = lists[listIndex];

  // monta mensagem de evento
  const event = {
    event: 'list.checkout.completed',
    listId: list.id,
    userId: list.userId,
    items: list.items,
    summary: list.summary,
    timestamp: Date.now()
  };

  try {
    const RABBIT = process.env.RABBITMQ_URL || 'amqp://localhost';
    const conn = await amqplib.connect(RABBIT);
    const ch = await conn.createChannel();
    const EX = 'shopping_events';
    await ch.assertExchange(EX, 'topic', { durable: true });
    const routingKey = 'list.checkout.completed';
    ch.publish(EX, routingKey, Buffer.from(JSON.stringify(event)), { persistent: true });
    await ch.close();
    await conn.close();
    console.log(`[Event] published ${routingKey} for list ${list.id}`);
  } catch (err) {
    console.error('Erro publicando evento de checkout:', err.message || err);
  }

  // retorno imediato
  res.status(202).json({ message: 'Checkout accepted' });
});

// Porta do serviço
const PORT = 3003;
app.listen(PORT, () => {
  registry.register("list-service", "localhost", PORT);
  console.log(`List Service rodando em http://localhost:${PORT}`);
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "list-service" }); 
});

process.on('SIGINT', () => {
  registry.unregister('list-service');
  process.exit();
});
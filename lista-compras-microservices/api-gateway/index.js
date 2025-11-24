const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const registry = require('../shared/serviceRegistry');
const axios = require('axios');
const morgan = require('morgan');

const app = express();
app.use(express.json());
app.use(morgan('combined')); // logs de requisições

// Configurar timeouts
app.use((req, res, next) => {
  req.setTimeout(30000); // 30 segundos
  res.setTimeout(30000);
  next();
});

// Circuit breaker simples
const circuit = {}; // { serviceName: { failures, openUntil } }
const FAILURE_THRESHOLD = 3;
const OPEN_MS = 30 * 1000; // 30s

function isCircuitOpen(name) {
  const s = circuit[name];
  if (!s) return false;
  if (s.openUntil && Date.now() < s.openUntil) return true;
  return false;
}

function recordFailure(name) {
  if (!circuit[name]) circuit[name] = { failures: 0, openUntil: null };
  circuit[name].failures++;
  if (circuit[name].failures >= FAILURE_THRESHOLD) {
    circuit[name].openUntil = Date.now() + OPEN_MS;
    console.warn(`[Circuit] ${name} aberto por ${OPEN_MS}ms`);
  }
}

function recordSuccess(name) {
  circuit[name] = { failures: 0, openUntil: null };
}

// Health check polling a cada 30s
async function healthCheckAll() {
  const services = registry.getAll();
  for (const [name, info] of Object.entries(services)) {
    try {
      await axios.get(`http://${info.host}:${info.port}/health`, { timeout: 3000 });
      recordSuccess(name);
    } catch (err) {
      recordFailure(name);
    }
  }
}
setInterval(healthCheckAll, 30 * 1000);
healthCheckAll().catch(()=>{});

// Helper proxy wrapper
function proxyRoute(serviceName) {
  return (req, res, next) => {
    const svc = registry.get(serviceName);
    if (!svc) return res.status(503).json({ error: `${serviceName} indisponível (não registrado)` });
    if (isCircuitOpen(serviceName)) return res.status(503).json({ error: `${serviceName} indisponível (circuit aberto)` });

    const target = `http://${svc.host}:${svc.port}`;
    // create instance of proxy for this request
    createProxyMiddleware({
      target,
      changeOrigin: true,
      logLevel: 'warn',
      timeout: 25000, // 25 segundos
      proxyTimeout: 25000,
      // Garantir que o corpo (JSON) já parseado pelo express.json() seja repassado
      onProxyReq: (proxyReq, req, res) => {
        try {
          if (req.body && Object.keys(req.body).length) {
            const bodyData = JSON.stringify(req.body);
            // Atualiza headers e escreve o body no request upstream
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
          }
        } catch (err) {
          console.warn('[Proxy] falha ao repassar body para upstream:', err && err.message ? err.message : err);
        }
      },
      onError: (err, req, res) => {
        console.error(`[Proxy Error] ${serviceName}:`, err.message);
        recordFailure(serviceName);
        res.status(502).json({ error: 'Erro ao conectar com serviço upstream' });
      },
      onProxyRes: (proxyRes) => {
        // se deu ok, registra sucesso
        recordSuccess(serviceName);
      }
    })(req, res, next);
  };
}

// Roteamento básico
app.use('/api/auth', proxyRoute('user-service'));
app.use('/api/users', proxyRoute('user-service'));
app.use('/api/items', proxyRoute('item-service'));
app.use('/api/lists', proxyRoute('list-service'));

// Registry endpoint
app.get('/registry', (req, res) => {
  const data = registry.getAll();
  // add circuit info
  const enhanced = {};
  for (const [k, v] of Object.entries(data)) {
    enhanced[k] = { ...v, circuit: circuit[k] || { failures:0, openUntil:null } };
  }
  res.json(enhanced);
});

// Health aggregates (status do gateway em relação aos serviços)
app.get('/health', async (req, res) => {
  const services = registry.getAll();
  const statuses = {};
  for (const [name, info] of Object.entries(services)) {
    statuses[name] = {
      registered: true,
      circuitOpen: isCircuitOpen(name),
      lastSeen: info.lastSeen
    };
  }
  res.json({ status: 'ok', services: statuses });
});

// Dashboard agregado (exige Authorization header e encaminha para list-service)
app.get('/api/dashboard', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: "Authorization header required" });

    const svc = registry.get('list-service');
    if (!svc) return res.status(503).json({ error: "list-service indisponível" });
    const resp = await axios.get(`http://${svc.host}:${svc.port}/lists`, {
      headers: { authorization: auth }
    });
    const lists = resp.data || [];
    // calcula estatísticas
    const totalLists = lists.length;
    const totalItems = lists.reduce((acc, l) => acc + (l.items?.length || 0), 0);
    const estimatedTotal = lists.reduce((acc, l) => acc + (l.summary?.estimatedTotal || 0), 0);

    res.json({ totalLists, totalItems, estimatedTotal, lists });
  } catch (err) {
    console.error(err.message || err);
    res.status(500).json({ error: "Erro ao montar dashboard" });
  }
});

// Busca global: itens (item-service) + listas do usuário por nome (list-service)
app.get('/api/search', async (req, res) => {
  const q = req.query.q || '';
  if (!q) return res.status(400).json({ error: "q query param required" });

  const results = {};
  try {
    const itemSvc = registry.get('item-service');
    if (itemSvc) {
      const r = await axios.get(`http://${itemSvc.host}:${itemSvc.port}/search?q=${encodeURIComponent(q)}`);
      results.items = r.data;
    } else results.items = [];
  } catch (err) {
    results.items = [];
  }

  // search in lists (requires auth)
  const auth = req.headers.authorization;
  if (auth) {
    try {
      const listSvc = registry.get('list-service');
      if (listSvc) {
        const r = await axios.get(`http://${listSvc.host}:${listSvc.port}/lists`, { headers: { authorization: auth } });
        results.lists = (r.data || []).filter(l => l.name && l.name.toLowerCase().includes(q.toLowerCase()));
      } else results.lists = [];
    } catch (err) {
      results.lists = [];
    }
  } else {
    results.lists = [];
  }

  res.json(results);
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`API Gateway rodando em http://localhost:${PORT}`);
});
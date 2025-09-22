## Lista de Compras
O foco deste projeto é o uso de microsserviços em um sistema de lista de compras com token JWT, Banco NoSQL baseado em arquivos JSON e Node.js + Express.

## INSTRUÇÕES DE EXECUÇÃO

### Setup:
```bash
npm install
npm run install:all
```

### Execução:
```bash
# Terminal 1
cd services/user-service && npm start

# Terminal 2  
cd services/item-service && npm start

# Terminal 3
cd services/list-service && npm start

# Terminal 4
cd api-gateway && npm start

# Terminal 5 - Teste
node client-demo.js
```

### Verificação:
```bash
curl http://localhost:3000/health
curl http://localhost:3000/registry
```

---

## DICAS DE IMPLEMENTAÇÃO

1. **Comece pelo User Service** - base para autenticação
2. **Use o exemplo do Roteiro 3** como referência para estrutura
3. **Implemente um serviço por vez** e teste isoladamente  
4. **Service Registry é crítico** - teste bem a descoberta
5. **Logs são essenciais** para debug de comunicação entre serviços

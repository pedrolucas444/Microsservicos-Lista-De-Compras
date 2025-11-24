# 🐇 RabbitMQ — Passos na Management UI (GUI) para a Demo

## 1. Acessar a interface de administração
Abra no navegador:
http://localhost:15672
Login padrão (se você não mudou):
- **User:** guest  
- **Pass:** guest  

---

## 2. Criar Exchange (Opcional — os serviços fazem `assertExchange`, mas ajuda a visualizar)

1. No menu lateral, clique em **Exchanges**
2. Clique em **Add a new exchange**
3. Preencha:

- **Name:** `shopping_events`
- **Type:** `topic`
- **Durable:** ☑️ marcado
- **Auto-delete:** ❌ (deixe desmarcado)
- **Internal:** ❌

Clique **Add exchange**.

---

## 3. Criar Queues

### Queue 1
1. Vá em **Queues**
2. Clique em **Add a new queue**
3. Configure:
- **Name:** `checkout_notify`
- **Durable:** ☑️

Clique **Add queue**.

### Queue 2
1. Vá em **Add a new queue** novamente
2. Configure:
- **Name:** `checkout_analytics`
- **Durable:** ☑️

Clique **Add queue**.

---

## 4. Fazer Bindings das Queues com o Exchange

Repita para as duas filas:

### Para `checkout_notify`
1. Vá em **Queues**
2. Clique em `checkout_notify`
3. Vá na aba **Bindings**
4. Em “Bind this queue to an exchange”, selecione:
   - **Exchange:** `shopping_events`
   - **Routing key:** `list.checkout.#`
5. Clique em **Bind**

### Para `checkout_analytics`
1. Vá em **Queues**
2. Clique em `checkout_analytics`
3. Aba **Bindings**
4. Configure:
   - **Exchange:** `shopping_events`
   - **Routing key:** `list.checkout.#`
5. Clique em **Bind**

---

## 5. Conferir as mensagens passando

- Vá em **Exchanges** → selecione `shopping_events`
  - Você verá contadores de “Publish”, “Deliver”, “Ack”.
- Vá em **Queues**
  - Você verá os gráficos por fila (mensagens prontas, não processadas, etc.)

---

## 6. Ler mensagens manualmente (sem consumer)

1. Vá em **Queues**
2. Clique em qualquer fila (ex: `checkout_notify`)
3. Role até a seção **Get messages**
4. Clique em **Get Message(s)**

Você verá o corpo da mensagem, headers e o JSON enviado pelo serviço.

---

## Resumo Geral

- Exchange criado: `shopping_events` (topic)
- Queues:
  - `checkout_notify`
  - `checkout_analytics`
- Ambos bindados com o routing key: `list.checkout.#`
- Pode acompanhar gráfico e contadores pela UI
- Pode inspecionar mensagens pelo “Get messages”

---

Pronto! Arquivo `.md` organizado e pronto pra colar onde quiser.

```
# cria usuário
rabbitmqctl add_user pedro senhaSegura

# dá tag de administrador (opcional)
rabbitmqctl set_user_tags pedro administrator

# seta permissões (ex.: allow tudo)
rabbitmqctl set_permissions -p / pedro ".*" ".*" ".*"
```
Terminal A — User Service (porta 3001)
```
npm run start:user
```
Terminal B — Item Service (porta 3002)
```
npm run start:item
```
Terminal C — List Service (porta 3003)
```
npm run start:list
```
Terminal D — API Gateway (porta 3000)
```
npm run start:gateway
```
Terminal E — Consumers (opcional, dois terminais ou em background)
```
# Consumer de notificação (loga envio de comprovante)
npm run start:consumer:notify

# Consumer de analytics (calcula total gasto)
npm run start:consumer:analytics
```
const amqplib = require('amqplib');
const fs = require('fs');
const path = require('path');

const RABBIT = process.env.RABBITMQ_URL || 'amqp://localhost';
const EX = 'shopping_events';
const BINDING = 'list.checkout.#';
const QUEUE = 'checkout_notify';

async function run() {
  const conn = await amqplib.connect(RABBIT);
  const ch = await conn.createChannel();
  await ch.assertExchange(EX, 'topic', { durable: true });
  await ch.assertQueue(QUEUE, { durable: true });
  await ch.bindQueue(QUEUE, EX, BINDING);

  console.log('Notify consumer aguardando mensagens...');

  ch.consume(QUEUE, (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString());
      const userId = payload.userId;
      // lê arquivo shared/users.json para obter email
      const usersFile = path.join(__dirname, '..', 'shared', 'users.json');
      let users = [];
      try {
        users = JSON.parse(fs.readFileSync(usersFile, 'utf8') || '[]');
      } catch (e) { users = []; }

      const user = users.find(u => u.id === userId) || {};
      const email = user.email || 'unknown@local';

      console.log(`Enviando comprovante da lista ${payload.listId} para o usuário ${email}`);
      ch.ack(msg);
    } catch (err) {
      console.error('Notify consumer erro ao processar mensagem:', err.message || err);
      ch.nack(msg, false, false);
    }
  }, { noAck: false });
}

run().catch(err => {
  console.error('Notify consumer falhou:', err.message || err);
  process.exit(1);
});

const amqplib = require('amqplib');
const RABBIT = process.env.RABBITMQ_URL || 'amqp://localhost';
const EX = 'shopping_events';
const BINDING = 'list.checkout.#';
const QUEUE = 'checkout_analytics';

async function run() {
  const conn = await amqplib.connect(RABBIT);
  const ch = await conn.createChannel();
  await ch.assertExchange(EX, 'topic', { durable: true });
  await ch.assertQueue(QUEUE, { durable: true });
  await ch.bindQueue(QUEUE, EX, BINDING);

  console.log('Analytics consumer aguardando mensagens...');

  ch.consume(QUEUE, (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString());
      // calcula total gasto a partir do summary ou dos items
      let total = 0;
      if (payload.summary && typeof payload.summary.estimatedTotal === 'number') {
        total = payload.summary.estimatedTotal;
      } else if (Array.isArray(payload.items)) {
        total = payload.items.reduce((s, it) => s + (it.estimatedPrice || 0), 0);
      }

      console.log(`Analytics: Lista ${payload.listId} processada. Total gasto: R$ ${total.toFixed(2)}`);
      ch.ack(msg);
    } catch (err) {
      console.error('Analytics consumer erro ao processar mensagem:', err.message || err);
      ch.nack(msg, false, false);
    }
  }, { noAck: false });
}

run().catch(err => {
  console.error('Analytics consumer falhou:', err.message || err);
  process.exit(1);
});

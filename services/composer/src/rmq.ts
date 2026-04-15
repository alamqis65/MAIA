import { Connection, connect, Channel, ChannelModel } from "amqplib";

export type RmqConn = { conn: ChannelModel; ch: Channel };

let conn: ChannelModel;

export async function setupRmq(url: string, exchangeName: string): Promise<RmqConn> {
  conn = await connect(url);
  const ch = await conn.createChannel();
  await ch.assertExchange(exchangeName, "topic", { durable: true });
  return { conn, ch };
}

export async function bindQueue(ch: Channel, exchange: string, queue: string, routingKey: string) {
  await ch.assertQueue(queue, { durable: true });
  await ch.bindQueue(queue, exchange, routingKey);
}

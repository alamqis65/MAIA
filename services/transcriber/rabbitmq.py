import json
import aio_pika

from config import RABBITMQ_URL, RABBITMQ_EXCHANGE, RABBITMQ_EXCHANGE_ROUTING_KEY

async def publish_transcript(payload: dict) -> None:
    if not RABBITMQ_URL:
        return

    connection = await aio_pika.connect_robust(RABBITMQ_URL)
    async with connection:
        channel = await connection.channel()
        exchange = await channel.declare_exchange(
            RABBITMQ_EXCHANGE,
            aio_pika.ExchangeType.TOPIC,
            durable=True,
        )
        body = json.dumps(payload).encode()
        await exchange.publish(
            aio_pika.Message(body=body, delivery_mode=aio_pika.DeliveryMode.PERSISTENT),
            RABBITMQ_EXCHANGE_ROUTING_KEY,
        )

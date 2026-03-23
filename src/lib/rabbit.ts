import amqp, { Channel, ChannelModel, ConsumeMessage } from "amqplib";
import { logger } from "./logger.js";

export class RabbitManager {
    private static client: ChannelModel | null = null;
    private static channel: Channel | null = null;
    private static readonly maxRetries = 3;
    private static readonly retryDelayMs = 3_000;
    private static readonly dlqSuffix = ".dlq";

    private constructor() {}

    public static async getClient(): Promise<ChannelModel> {
        if (this.client) {
            return this.client;
        }

        const url = process.env.RABBIT_URL;
        if (!url) {
            throw new Error("RABBIT_URL is not configured");
        }

        RabbitManager.client = await amqp.connect(url);
        logger.info({ url }, "rabbit client connected");
        return RabbitManager.client;
    }

    private static async getChannel() {
        if (this.channel) {
            return this.channel;
        }

        const client = await this.getClient();
        this.channel = await client.createChannel();
        logger.info("rabbit channel created");
        return this.channel;
    }

    public static async publish(
        exchange: string,
        routeKey: string,
        payload: string,
    ) {
        const channel = await this.getChannel();
        await channel.assertExchange(exchange, "topic", { durable: true });

        channel.publish(exchange, routeKey, Buffer.from(payload), {
            persistent: true,
            contentType: "application/json",
        });
    }

    public static async bindTopic(
        exchange: string,
        queue: string,
        routeKey: string,
    ): Promise<void> {
        const channel = await RabbitManager.getChannel();
        await channel.assertExchange(exchange, "topic", { durable: true });
        await channel.assertQueue(queue, { durable: true });
        await channel.bindQueue(queue, exchange, routeKey);
        logger.info(
            { exchange, queue, routeKey },
            "rabbit topic binding ready",
        );
    }

    public static async consume(
        queue: string,
        handler: (msg: ConsumeMessage, channel: Channel) => Promise<void>,
    ): Promise<void> {
        const channel = await this.getChannel();

        await channel.consume(queue, async (msg) => {
            if (!msg) return;

            const retryCount = this.getRetryCount(msg);
            logger.info(
                {
                    queue,
                    retryCount,
                    contentType: msg.properties.contentType,
                    messageSize: msg.content.length,
                },
                "rabbit message received",
            );

            try {
                await handler(msg, channel);
                channel.ack(msg);
                logger.info(
                    { queue, retryCount },
                    "rabbit message acknowledged",
                );
            } catch (error) {
                logger.error(
                    {
                        queue,
                        retryCount,
                        message: this.getErrorMessage(error),
                        stack: error instanceof Error ? error.stack : undefined,
                        error,
                    },
                    "Rabbit consumer failed",
                );

                if (retryCount < this.maxRetries) {
                    const headers = {
                        ...(msg.properties.headers ?? {}),
                        "x-retry-count": retryCount + 1,
                    };

                    channel.ack(msg);
                    logger.warn(
                        {
                            queue,
                            retryCount,
                            nextRetryCount: retryCount + 1,
                            retryDelayMs: this.retryDelayMs,
                        },
                        "rabbit message scheduled for retry",
                    );

                    setTimeout(() => {
                        void channel.sendToQueue(queue, msg.content, {
                            persistent: true,
                            headers,
                            contentType:
                                msg.properties.contentType ??
                                "application/json",
                        });
                    }, this.retryDelayMs);
                    return;
                }

                await this.moveToDeadLetterQueue(queue, msg, channel, error);
                channel.ack(msg);
                logger.error(
                    { queue, retryCount },
                    "rabbit message moved to dead letter queue",
                );
            }
        });
        logger.info({ queue }, "rabbit consumer registered");
    }
    private static getRetryCount(msg: ConsumeMessage): number {
        const raw = msg.properties.headers?.["x-retry-count"];
        if (typeof raw === "number") {
            return raw;
        }
        if (typeof raw === "string") {
            const parsed = Number(raw);
            return Number.isFinite(parsed) ? parsed : 0;
        }
        return 0;
    }

    private static async moveToDeadLetterQueue(
        queue: string,
        msg: ConsumeMessage,
        channel: Channel,
        error: unknown,
    ): Promise<void> {
        const deadLetterQueue = `${queue}${this.dlqSuffix}`;
        await channel.assertQueue(deadLetterQueue, { durable: true });

        const headers = {
            ...(msg.properties.headers ?? {}),
            "x-original-queue": queue,
            "x-dead-lettered-at": new Date().toISOString(),
            "x-error-message": this.getErrorMessage(error),
        };

        channel.sendToQueue(deadLetterQueue, msg.content, {
            persistent: true,
            headers,
            contentType: msg.properties.contentType ?? "application/json",
        });
        logger.warn(
            {
                queue,
                deadLetterQueue,
                errorMessage: this.getErrorMessage(error),
            },
            "rabbit message published to dead letter queue",
        );
    }

    private static getErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        return "Unknown error";
    }
}

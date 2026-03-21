import { createClient } from "redis";
import { logger } from "./logger.js";

type RedisClient = ReturnType<typeof createClient>;
export class RedisManager {
    private static client: RedisClient | null = null;

    private constructor() {}

    public static async getClient(): Promise<RedisClient> {
        if (this.client?.isOpen) {
            return this.client;
        }

        const client =
            this.client ??
            createClient({
                url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
            });

        client.on("error", (e) => {
            logger.error({ err: e }, "redis client error");
        });

        if (!client.isOpen) {
            await client.connect();
        }
        this.client = client;
        return client;
    }

    public static async quit(): Promise<void> {
        if (this.client?.isOpen) {
            await this.client.quit();
        }
        this.client = null;
    }

    public static async acquireLock(
        key: string,
        ttlSeconds = 30,
    ): Promise<boolean> {
        const client = await this.getClient();
        const result = await client.set(key, "1", { NX: true, EX: ttlSeconds });
        logger.debug({ key, ttlSeconds, acquired: result === "OK" }, "lock attempt");
        return result === "OK";
    }

    public static async releaseLock(key: string): Promise<void> {
        const client = await this.getClient();
        await client.del(key);
        logger.debug({ key }, "lock released");
    }

    public static async getOrSetSaveTime(
        key: string,
        id: string,
        cb: () => Promise<void>,
        saveWindow: number = 300_000,
    ) {
        const client = await this.getClient();
        const now = Date.now();
        const lastSaveTime = await client.zScore(key, id);
        if (lastSaveTime != null && now - Number(lastSaveTime) < saveWindow) {
            logger.debug(
                { key, id, lastSaveTime: Number(lastSaveTime), now, saveWindow },
                "persistence scheduling skipped (inside window)",
            );
            return false;
        }

        logger.info(
            { key, id, now, saveWindow },
            "persistence scheduling due, running callback",
        );
        await cb();
        await client.zAdd(key, [{ score: now, value: id }]);
        logger.info({ key, id, score: now }, "persistence schedule timestamp updated");
        return true;
    }
}

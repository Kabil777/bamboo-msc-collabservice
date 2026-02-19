import { Redis as IORedisClient, Cluster as IORedisCluster, Result } from 'ioredis';
type Client = IORedisClient | IORedisCluster;
declare module 'ioredis' {
    interface RedisCommander<Context> {
        acquireLock(keys: number, ...args: (string | number)[]): Result<string, Context>;
        extendLock(keys: number, ...args: (string | number)[]): Result<string, Context>;
        releaseLock(keys: number, ...args: (string | number)[]): Result<string, Context>;
    }
}
export declare function ensureCommands(client: Client): void;
export {};

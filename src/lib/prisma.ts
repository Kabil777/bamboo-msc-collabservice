import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

export class PrismaManager {
    private static client: PrismaClient | null = null;

    private constructor() {}

    public static getClient(): PrismaClient {
        if (!this.client) {
            const connectionString = process.env.DATABASE_URL;
            if (!connectionString) throw new Error("DATABASE_URL is missing");

            const adapter = new PrismaPg({ connectionString });
            this.client = new PrismaClient({
                adapter,
                log: [
                    { emit: "stdout", level: "info" },
                    { emit: "stdout", level: "warn" },
                    { emit: "stdout", level: "error" },
                ],
            });
        }
        return this.client;
    }
}

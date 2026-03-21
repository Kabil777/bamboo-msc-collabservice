import { Prisma } from "../generated/prisma/client.js";
import { logger } from "../lib/logger.js";
import { PrismaManager } from "../lib/prisma.js";
import { RabbitManager } from "../lib/rabbit.js";

export type DeleteMessage = {
    type: "DOCUMENT" | "BLOG";
    id: string;
};

function isDeleteMessage(value: unknown): value is DeleteMessage {
    if (!value || typeof value !== "object") return false;

    const data = value as Record<string, unknown>;
    return (
        (data.type === "DOCUMENT" || data.type === "BLOG") &&
        typeof data.id === "string"
    );
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return "Unknown error";
}

export async function startRabbitConsumers() {
    await RabbitManager.bindTopic(
        "collab.events",
        "queue.collab.document.deleted",
        "collab.document.deleted",
    );
    logger.info(
        {
            exchange: "collab.events",
            queue: "queue.collab.document.deleted",
            routeKey: "collab.document.deleted",
        },
        "collab delete consumer binding initialized",
    );

    await RabbitManager.consume(
        "queue.collab.document.deleted",
        async (msg) => {
            try {
                const parsed: unknown = JSON.parse(msg.content.toString());

                if (!isDeleteMessage(parsed)) {
                    throw new Error("Invalid delete message payload");
                }

                logger.info(parsed, "collab delete message handling started");

                if (parsed.type === "BLOG") {
                    await PrismaManager.getClient().blogPageState.deleteMany({
                        where: {
                            blogId: parsed.id,
                        },
                    });
                    logger.info(parsed, "collab blog state cleanup completed");
                    return;
                }

                await PrismaManager.getClient().docsPageState.deleteMany({
                    where: {
                        docsId: parsed.id,
                    },
                });

                await PrismaManager.getClient().docsSidebarState.deleteMany({
                    where: {
                        docsId: parsed.id,
                    },
                });
                logger.info(parsed, "collab docs state cleanup completed");
            } catch (error: unknown) {
                if (error instanceof Prisma.PrismaClientKnownRequestError) {
                    logger.error(
                        { code: error.code, message: error.message },
                        "collab delete prisma known error",
                    );
                    throw error;
                }

                if (error instanceof Prisma.PrismaClientValidationError) {
                    logger.error(
                        { message: error.message },
                        "collab delete prisma validation error",
                    );
                    throw error;
                }

                logger.error(
                    { message: getErrorMessage(error) },
                    "collab delete consumer failed",
                );
                throw error;
            }
        },
    );
}

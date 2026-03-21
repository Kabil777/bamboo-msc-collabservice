import { PrismaClient } from "../../generated/prisma/client.js";
import { AuthError } from "../../lib/exceptions/AuthException.js";
import { PrismaManager } from "../../lib/prisma.js";
import { RedisManager } from "../../lib/Redis.js";
import { updateArgs } from "../../types/ws/hocuspocus/collabHookTypes.js";
import * as Y from "yjs";
import { logger } from "../../lib/logger.js";

export class DocsStateRepository {
    private readonly prismaClient: PrismaClient;

    constructor() {
        this.prismaClient = PrismaManager.getClient();
    }

    public async getDocsStateById(docsId: any): Promise<Uint8Array | null> {
        const row = await this.prismaClient.docsPageState.findUnique({
            where: { pageId: docsId },
            select: { yjsState: true },
        });

        return row?.yjsState ?? null;
    }

    public async saveDocsStateById(
        pageId: any,
        docsId: any,
        yjsState: Uint8Array,
    ): Promise<void> {
        const bytes = new Uint8Array(yjsState);
        await this.prismaClient.docsPageState.upsert({
            where: { pageId: pageId },
            update: { yjsState: bytes, updatedAt: new Date() },
            create: {
                docsId,
                pageId,
                yjsState: bytes,
                updatedAt: new Date(),
            },
        });
    }
    public async updateDocsPage({ documentName, document, info }: updateArgs) {
        const lock = await RedisManager.acquireLock(documentName, 60);
        if (!lock) return;
        try {
            logger.info(
                {
                    documentName,
                    type: info.type,
                    scheduleKey: "time-set-docs",
                },
                "docs-page persistence scheduling check",
            );
            await RedisManager.getOrSetSaveTime(
                "time-set-docs",
                documentName,
                async () => {
                    if (info.type !== "docs-page") return;
                    const yJsState = Y.encodeStateAsUpdate(document);
                    logger.info(
                        {
                            documentName,
                            docsId: info.docsId,
                            pageId: info.pageId,
                        },
                        "docs-page persistence callback due, saving state",
                    );
                    await this.saveDocsStateById(
                        info.pageId,
                        info.docsId,
                        yJsState,
                    );
                },
            );
        } catch (error: any) {
            const msg =
                error instanceof Error ? error.message : "persistance failed";
            throw new AuthError({ message: msg });
        } finally {
            await RedisManager.releaseLock(documentName);
        }
    }
}

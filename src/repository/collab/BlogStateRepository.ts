import { PrismaClient } from "../../generated/prisma/client.js";
import { PrismaManager } from "../../lib/prisma.js";
import { RedisManager } from "../../lib/Redis.js";
import * as Y from "yjs";
import { AuthError } from "../../lib/exceptions/AuthException.js";
import { updateArgs } from "../../types/ws/hocuspocus/collabHookTypes.js";
import { logger } from "../../lib/logger.js";

export class BlogStateRepository {
    private readonly prismaClient: PrismaClient;

    constructor() {
        this.prismaClient = PrismaManager.getClient();
    }

    public async ensureBlogState(
        blogId: string,
        document: Y.Doc,
    ): Promise<void> {
        const emptyState = Y.encodeStateAsUpdate(document);
        await this.prismaClient.blogPageState.upsert({
            where: { blogId },
            update: {},
            create: { blogId, yjsState: new Uint8Array(emptyState) },
        });
    }
    public async getBlogStateById(blogId: any): Promise<Uint8Array | null> {
        const row = await this.prismaClient.blogPageState.findUnique({
            where: { blogId },
            select: { yjsState: true },
        });

        return row?.yjsState ?? null;
    }

    public async saveBlogStateById(
        blogId: any,
        yjsState: Uint8Array,
    ): Promise<void> {
        const bytes = new Uint8Array(yjsState);
        await this.prismaClient.blogPageState.upsert({
            where: { blogId: blogId },
            update: { yjsState: bytes, updatedAt: new Date() },
            create: {
                blogId,
                yjsState: bytes,
                updatedAt: new Date(),
            },
        });
    }

    public async updateBlog({ documentName, document, info }: updateArgs) {
        const lock = await RedisManager.acquireLock(documentName, 60);
        if (!lock) return;
        try {
            logger.info(
                { documentName, type: info.type, scheduleKey: "timeSet" },
                "blog persistence scheduling check",
            );
            await RedisManager.getOrSetSaveTime(
                "timeSet",
                documentName,
                async () => {
                    if (info.type !== "blog") return;
                    const yJsState = Y.encodeStateAsUpdate(document);
                    logger.info(
                        { documentName, blogId: info.blogId },
                        "blog persistence callback due, saving state",
                    );
                    await this.saveBlogStateById(info.blogId, yJsState);
                },
            );
        } catch (error: any) {
            const message =
                error instanceof Error ? error.message : "persist failed";
            throw new AuthError({ message });
        } finally {
            await RedisManager.releaseLock(documentName);
        }
    }

    public async getDocById(id: string): Promise<Uint8Array | null> {
        try {
            const content = await this.prismaClient.blogPageState.findUnique({
                where: { blogId: id },
                select: {
                    yjsState: true,
                },
            });
            return content?.yjsState ?? null;
        } catch (e: unknown) {
            if (e instanceof Error) throw new Error(e.message);
            throw new Error("Failed to load blog document");
        }
    }
}

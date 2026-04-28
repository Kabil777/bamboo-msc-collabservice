import type { Server as HttpServer, IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { logger } from "../lib/logger.js";
import { CollabServer } from "./servers/CollabServer.js";
import { CommentServer } from "./servers/CommentServer.js";

export class UpgradeHandler {
    private readonly commentServer: CommentServer;
    private readonly collabServer: CollabServer;

    constructor() {
        this.commentServer = new CommentServer();
        this.collabServer = new CollabServer();
    }

    public attach(server: HttpServer): void {
        server.on(
            "upgrade",
            async (request: IncomingMessage, socket: Socket, head: Buffer) => {
                try {
                    const pathName = new URL(
                        request.url ?? "/",
                        process.env.BASE_DOMAIN || "http://localhost",
                    ).pathname;

                    if (pathName === "/collab") {
                        await this.collabServer.handleUpgrade(
                            request,
                            socket,
                            head,
                        );
                        return;
                    }

                    if (pathName === "/comments") {
                        this.commentServer.handleUpgrade(request, socket, head);
                        return;
                    }

                    logger.warn(
                        { pathName, url: request.url },
                        "ws upgrade rejected: unknown route",
                    );
                    socket.destroy();
                } catch (error) {
                    logger.error(
                        { err: error, url: request.url },
                        "ws upgrade failed",
                    );
                    socket.destroy();
                }
            },
        );
    }

    public getCollabServer(): CollabServer {
        return this.collabServer;
    }
}

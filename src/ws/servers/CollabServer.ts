import { Redis } from "@hocuspocus/extension-redis";
import { Server as HocuspocusServer } from "@hocuspocus/server";
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { HocuspocusHooks } from "../hooks/HocuspocusHooks.js";

export class CollabServer {
    private readonly server: HocuspocusServer;
    private readonly hooks: HocuspocusHooks;

    constructor() {
        this.hooks = new HocuspocusHooks();
        this.server = this.initHocuspocusWssServer();
    }

    private initHocuspocusWssServer(): HocuspocusServer {
        return new HocuspocusServer({
            extensions: [
                new Redis({
                    host: process.env.REDIS_URL || "127.0.0.1",
                    port: Number(process.env.REDIS_PORT || 6379),
                }),
            ],
            onUpgrade: this.hooks.onUpgrade.bind(this.hooks),
            onAuthenticate: this.hooks.onAuthenticate.bind(this.hooks),
            onLoadDocument: this.hooks.onLoadDocument.bind(this.hooks),
            onDisconnect: this.hooks.onDisconnect.bind(this.hooks),
            onChange: this.hooks.onChange.bind(this.hooks),
        });
    }

    public async handleUpgrade(
        request: IncomingMessage,
        socket: Socket,
        head: Buffer,
    ): Promise<void> {
        await this.server.hocuspocus.hooks("onUpgrade", {
            request,
            socket,
            head,
            instance: this.server.hocuspocus,
        });

        this.server.webSocketServer.handleUpgrade(
            request,
            socket,
            head,
            (ws, _request) => {
                this.server.webSocketServer.emit("connection", ws, request);
            },
        );
    }

    public getInstance(): HocuspocusServer {
        return this.server;
    }
}

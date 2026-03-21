import express, { Express } from "express";
import { createServer, Server } from "node:http";
import { logger } from "../lib/logger.js";
import { UpgradeHandler } from "../ws/upgradeHandler.js";
import { HttpRoutes } from "./routes/HttpRoute.js";
import { createCorsMiddleware } from "./middleware/cors.js";

export class HttpServer {
    private readonly app: Express;
    private readonly htServer: Server;

    constructor(upgradeHandler: UpgradeHandler) {
        this.app = express();
        this.htServer = createServer(this.app);
        this.registerHttpRoute(upgradeHandler);
    }

    private registerHttpRoute(upgradeHandler: UpgradeHandler): void {
        this.app.use(createCorsMiddleware());
        this.app.use(express.json());

        this.app.get("/health", (_, res) => {
            res.status(200).json({ ok: true, service: "ws-svc" });
        });

        const routes = new HttpRoutes(
            upgradeHandler.getCollabServer(),
            this.app,
        );
        routes.register();
    }

    public getHttpServer(): Server {
        return this.htServer;
    }

    public listen(port: number): void {
        this.htServer.listen(port, () => {
            logger.info({ port }, "HTTP listening");
        });
    }
}

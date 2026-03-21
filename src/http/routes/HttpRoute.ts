import { Express } from "express";
import { BlogSaveController } from "../controllers/blogSaveController/blogSaveController.js";
import { DocsController } from "../controllers/blogSaveController/docsSaveController.js";
import { CollabServer } from "../../ws/servers/CollabServer.js";

export class HttpRoutes {
    private blogController: BlogSaveController;
    private docsController: DocsController;

    constructor(collabServer: CollabServer, app: Express) {
        this.blogController = new BlogSaveController(collabServer, app);
        this.docsController = new DocsController(app, collabServer);
    }

    private blogRoutes() {
        this.blogController.registerRoutes();
    }

    private docsRoutes() {
        this.docsController.registerRoutes();
    }

    public register() {
        this.blogRoutes();
        this.docsRoutes();
    }
}

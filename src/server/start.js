import { createCollabServer } from "./collabServer.js";
import { createHttpServer, listenHttpServer } from "./httpServer.js";

export function startServer() {
    const collabServer = createCollabServer();
    const httpServer = createHttpServer(collabServer);
    listenHttpServer(httpServer);
}

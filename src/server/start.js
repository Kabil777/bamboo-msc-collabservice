import { createCollabServer } from "./collabServer.js";
import { createHttpServer, listenHttpServer } from "./httpServer.js";
import {
    ensureCanonicalSyncSchema,
    startCanonicalSyncWorker,
} from "#lib/canonicalSyncOutbox.js";

export async function startServer() {
    await ensureCanonicalSyncSchema();
    startCanonicalSyncWorker();
    const collabServer = createCollabServer();
    const httpServer = createHttpServer(collabServer);
    listenHttpServer(httpServer);
}

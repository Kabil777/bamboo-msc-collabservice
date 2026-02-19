import { Server } from "@hocuspocus/server";
import { Logger } from "@hocuspocus/extension-logger";
import { Redis } from "@hocuspocus/extension-redis";
import { REDIS_CONFIG } from "./config.js";
import { collabHooks } from "./hooks.js";

export function createCollabServer() {
    return new Server({
        extensions: [new Redis(REDIS_CONFIG), new Logger()],
        ...collabHooks,
    });
}

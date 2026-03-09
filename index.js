import "dotenv/config";
import { startServer } from "./src/server/start.js";

void startServer().catch((error) => {
    console.error("[collab] failed to start", error);
    process.exit(1);
});

import { configDotenv } from "dotenv";
import { HttpServer } from "./http/httpServer.js";
import { UpgradeHandler } from "./ws/upgradeHandler.js";
import { startRabbitConsumers } from "./queue/rabbitConsumer.js";

const initServer = async () => {
    configDotenv();
    const upgradeHandler = new UpgradeHandler();
    const http = new HttpServer(upgradeHandler);

    upgradeHandler.attach(http.getHttpServer());

    const port = Number(process.env.PORT ?? 8092);
    await startRabbitConsumers();
    http.listen(port);
};

await initServer();

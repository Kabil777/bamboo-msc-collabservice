import pino from "pino";

export const logger = pino({
    name: "demo-ws",
    level: process.env.LOG_LEVEL || "info",
});

export const PORT = Number(process.env.PORT || 1234);
export const COLLAB_PATH = process.env.COLLAB_PATH || "/collab";
export const FIVE_MIN = 5 * 60 * 1000;

export const REDIS_CONFIG = {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
};

export const isCollabPath = (url = "") =>
    url === "/" || url.startsWith("/?") || url.startsWith(COLLAB_PATH);

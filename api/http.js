import "dotenv/config";
import axios from "axios";

function resolveApiBaseUrl() {
    const raw =
        process.env.API_BASE_URL ||
        process.env.NEXT_PUBLIC_API_SERVER_URL ||
        "http://localhost:8000";

    try {
        const parsed = new URL(raw);
        return `${parsed.protocol}//${parsed.host}`;
    } catch {
        throw new Error(
            `Invalid API base URL: "${raw}". Set API_BASE_URL to a full URL like http://localhost:8000`,
        );
    }
}

export const http = axios.create({
    baseURL: resolveApiBaseUrl(),
    withCredentials: true,
    timeout: 10_000,
});

http.interceptors.request.use((config) => {
    config.headers["Content-Type"] = "application/json";
    const userId = process.env.COLLAB_ACTOR_USER_ID;
    if (userId && !config.headers["X-User-Id"]) {
        config.headers["X-User-Id"] = userId;
    }
    return config;
});

http.interceptors.response.use(
    (res) => res,
    (err) => {
        return Promise.reject(err);
    },
);

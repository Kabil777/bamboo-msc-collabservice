import "dotenv/config";
import axios from "axios";

function resolveBaseUrl(...candidates) {
    const raw = candidates.find((value) => typeof value === "string" && value.trim());

    if (!raw) {
        throw new Error("No service base URL configured");
    }

    try {
        const parsed = new URL(raw);
        return `${parsed.protocol}//${parsed.host}`;
    } catch {
        throw new Error(
            `Invalid service base URL: "${raw}". Set POST_SERVICE_URL or API_BASE_URL to a full URL like http://localhost:8082`,
        );
    }
}

export const http = axios.create({
    baseURL: resolveBaseUrl(
        process.env.POST_SERVICE_URL,
        process.env.POST_SERVICE_URI,
        process.env.API_BASE_URL,
        process.env.NEXT_PUBLIC_API_SERVER_URL,
        "http://localhost:8090",
    ),
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

export function withActorHeaders(userId, headers = {}) {
    if (!userId) {
        return headers;
    }

    return {
        ...headers,
        "X-User-Id": String(userId),
    };
}

http.interceptors.response.use(
    (res) => res,
    (err) => {
        return Promise.reject(err);
    },
);

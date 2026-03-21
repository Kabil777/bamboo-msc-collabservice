import axios, { AxiosInstance } from "axios";
import { logger } from "../../lib/logger.js";

type RequestMeta = {
    startedAt: number;
};

export class BasePostClient {
    protected readonly client: AxiosInstance;

    protected constructor(client: AxiosInstance) {
        this.client = client;
    }

    protected static buildAxiosClient(): AxiosInstance {
        const resolvedBaseUrl = this.resolveBaseUrl(
            process.env.POST_SERVICE_URL,
            "http://localhost:8090",
        );
        logger.info(
            { baseURL: resolvedBaseUrl },
            "post client base URL resolved",
        );

        const client = axios.create({
            baseURL: resolvedBaseUrl,
            withCredentials: true,
            timeout: 10_000,
        });

        client.interceptors.request.use((config) => {
            config.headers = config.headers ?? {};
            if (!config.headers["Content-Type"]) {
                config.headers["Content-Type"] = "application/json";
            }
            (config as typeof config & { metadata?: RequestMeta }).metadata = {
                startedAt: Date.now(),
            };
            logger.info(
                {
                    method: config.method?.toUpperCase(),
                    url: config.url,
                    baseURL: config.baseURL,
                },
                "post client request started",
            );
            return config;
        });

        client.interceptors.response.use(
            (res) => {
                const startedAt = (
                    res.config as typeof res.config & { metadata?: RequestMeta }
                ).metadata?.startedAt;
                logger.info(
                    {
                        method: res.config.method?.toUpperCase(),
                        url: res.config.url,
                        status: res.status,
                        durationMs:
                            startedAt == null
                                ? undefined
                                : Date.now() - startedAt,
                    },
                    "post client request completed",
                );
                return res;
            },
            (err) => {
                if (axios.isAxiosError(err)) {
                    const startedAt = (
                        err.config as
                            | (typeof err.config & {
                                  metadata?: RequestMeta;
                              })
                            | undefined
                    )?.metadata?.startedAt;
                    logger.error(
                        {
                            method: err.config?.method?.toUpperCase(),
                            url: err.config?.url,
                            status: err.response?.status,
                            durationMs:
                                startedAt == null
                                    ? undefined
                                    : Date.now() - startedAt,
                            data: err.response?.data,
                        },
                        "post client request failed",
                    );
                }
                return Promise.reject(err);
            },
        );
        return client;
    }
    private static resolveBaseUrl(...urls: Array<string | undefined>): string {
        const rawUrl = urls.find(
            (value) => typeof value === "string" && value.trim(),
        );
        if (!rawUrl) {
            throw new Error("No service base URL configured");
        }
        try {
            const parsedUrl = new URL(rawUrl.trim());
            return `${parsedUrl.protocol}//${parsedUrl.host}`;
        } catch (error) {
            throw new Error(
                `Invalid service base URL: "${rawUrl}". Set POST_SERVICE_URL or API_BASE_URL to a full URL like http://localhost:8082`,
            );
        }
    }
    public get Client(): AxiosInstance {
        return this.client;
    }
}

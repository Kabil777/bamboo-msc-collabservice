import axios from "axios";
import { BasePostClient } from "./BasePostClient.js";
import { logger } from "../../lib/logger.js";
import { blogSaveType } from "../../http/controllers/blogSaveController/blogSaveController.js";

type VisibilityPayload = {
    visibility?: string;
    status?: string;
};

export type DocsTreeNode = {
    id: string;
    title: string;
    content: string;
    subTree: DocsTreeNode[];
};

export type DocsContentPayload = {
    tree: DocsTreeNode[];
    pages: Array<{ pageId: string; markdown: string }>;
    visibility?: string;
    status?: string;
};

export class PostCommandClient extends BasePostClient {
    private static instance: PostCommandClient | null = null;

    private constructor() {
        super(BasePostClient.buildAxiosClient());
    }

    public static create(): PostCommandClient {
        if (!this.instance) {
            this.instance = new PostCommandClient();
        }
        return this.instance;
    }

    public async saveBlogContent(
        blogId: string,
        content: blogSaveType,
        userId: string,
    ): Promise<void> {
        await this.post(
            `/api/v1/blog/${blogId}/content`,
            {
                ...content,
                content:
                    typeof content.content === "string"
                        ? content.content
                        : JSON.stringify(content.content),
            },
            userId,
        );
    }

    public async updateBlogVisibility(
        blogId: string,
        payload: VisibilityPayload,
        userId: string,
    ): Promise<void> {
        await this.post(`/api/v1/blog/${blogId}/visibility`, payload, userId);
    }

    public async saveDocsContent(
        docsId: string,
        payload: DocsContentPayload,
        userId: string,
    ): Promise<void> {
        await this.post(`/api/v1/docs/${docsId}/content`, payload, userId);
    }

    public async updateDocsVisibility(
        docsId: string,
        payload: VisibilityPayload,
        userId: string,
    ): Promise<void> {
        await this.post(`/api/v1/docs/${docsId}/visibility`, payload, userId);
    }

    private async post(
        path: string,
        body: unknown,
        userId: string,
    ): Promise<void> {
        try {
            await this.client.post(path, body, {
                headers: { "X-User-Id": userId },
            });
        } catch (error) {
            if (axios.isAxiosError(error)) {
                logger.error(
                    {
                        path,
                        userId,
                        status: error.response?.status,
                        data: error.response?.data,
                    },
                    "post command client request failed",
                );
            }
            throw error;
        }
    }

    private withActorHeaders(userId: string, headers = {}) {
        if (!userId) {
            return headers;
        }

        return {
            ...headers,
            "X-User-Id": String(userId),
        };
    }
}

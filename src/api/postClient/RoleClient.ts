import { BasePostClient } from "./BasePostClient.js";
import axios from "axios";
import { logger } from "../../lib/logger.js";

type RoleApiBody = {
    ok: boolean;
    role: string;
    readOnly: boolean;
    message: string;
};

type RoleApiResponse = RoleApiBody & { httpStatus: number };

export class PostRoleClient extends BasePostClient {
    private static instance: PostRoleClient | null = null;

    private constructor() {
        super(BasePostClient.buildAxiosClient());
    }

    static create(): PostRoleClient {
        if (!PostRoleClient.instance) {
            PostRoleClient.instance = new PostRoleClient();
        }
        return PostRoleClient.instance;
    }

    public async getBlogRole(
        blogId: string,
        userId: string,
    ): Promise<RoleApiResponse> {
        try {
            const res = await this.client.get<RoleApiBody>(
                `/api/v1/blog/role/${blogId}`,
                {
                    headers: { "X-User-Id": userId },
                },
            );
            return { ...res.data, httpStatus: res.status };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                logger.error(
                    {
                        blogId,
                        userId,
                        status: error.response?.status,
                        data: error.response?.data,
                    },
                    "post role client getBlogRole failed",
                );
            }
            throw error;
        }
    }

    public async getDocsRole(
        docsId: string,
        userId: string,
    ): Promise<RoleApiResponse> {
        try {
            const res = await this.client.get<RoleApiBody>(
                `/api/v1/docs/role/${docsId}`,
                {
                    headers: { "X-User-Id": userId },
                },
            );
            return { ...res.data, httpStatus: res.status };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                logger.error(
                    {
                        docsId,
                        userId,
                        status: error.response?.status,
                        data: error.response?.data,
                    },
                    "post role client getDocsRole failed",
                );
            }
            throw error;
        }
    }
}

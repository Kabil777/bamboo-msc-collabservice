import { http, withActorHeaders } from "./http.js";

export const BlogClient = {
    savePost: (blogId, content, meta = {}, options = {}) => {
        const { userId } = options;

        return http.post(
            `/api/v1/blog/${blogId}/content`,
            {
                content,
                visibility: meta.visibility,
                status: meta.status,
            },
            {
                headers: withActorHeaders(userId),
            },
        );
    },
};

import { http } from "./http.js";

export const BlogClient = {
    savePost: (blogId, content, meta = {}) => {
        return http.post(`/api/v1/blog/${blogId}/content`, {
            content,
            visibility: meta.visibility,
            status: meta.status,
        });
    },
};

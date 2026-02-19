import { http } from "./http.js";

export const BlogClient = {
    savePost: (blogId, content) => {
        return http.post(`/api/v1/blog/${blogId}/content`, {
            content,
        });
    },
};

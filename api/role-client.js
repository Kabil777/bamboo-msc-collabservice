import { http } from "./http.js";

export const RoleClient = {
    getBlogRole: (blogId, userId) => {
        return http.get(`/api/v1/blog/role/${blogId}`, {
            headers: {
                "X-User-Id": String(userId),
            },
        });
    },
    getDocsRole: (docsId, userId) => {
        return http.get(`/api/v1/docs/role/${docsId}`, {
            headers: {
                "X-User-Id": String(userId),
            },
        });
    },
};

import { http, withActorHeaders } from "./http.js";

export const DocsClient = {
    saveDocsContent: (docsId, payload, options = {}) => {
        const { userId } = options;

        return http.post(`/api/v1/docs/${docsId}/content/save`, payload, {
            headers: withActorHeaders(userId),
        });
    },
};

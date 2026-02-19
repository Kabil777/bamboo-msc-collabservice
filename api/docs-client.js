import { http } from "./http.js";

export const DocsClient = {
    saveDocsContent: (docsId, payload) => {
        return http.post(`/api/v1/docs/${docsId}/content/save`, payload);
    },
};

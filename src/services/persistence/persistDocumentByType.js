import {
    persistBlogState,
    persistDocsPageState,
    persistDocsSidebarState,
} from "./documentPersistenceAdapters.js";

export async function persistDocumentByType(
    info,
    document,
    update,
    isSaveReq,
) {
    switch (info.type) {
        case "blog":
            return persistBlogState(info.blogId, document, update, isSaveReq);

        case "docs-page":
            return persistDocsPageState(info.pageId, document, update);

        case "docs-sidebar":
            return persistDocsSidebarState(info.docsId, update);

        default:
            throw new Error("Unhandled document type");
    }
}

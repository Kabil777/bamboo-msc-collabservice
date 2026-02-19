export function parseCollabDocumentName(documentName) {
    const parts = documentName.split(":");

    if (parts[0] === "blog") {
        return { type: "blog", blogId: parts[1] };
    }

    if (parts[0] === "docs") {
        if (parts[1] === "page") {
            return { type: "docs-page", pageId: parts[2] };
        }
        if (parts[1] === "sidebar") {
            return { type: "docs-sidebar", docsId: parts[2] };
        }
    }

    throw new Error(`Unknown Doc type: ${documentName}`);
}

export function parseCollabDocumentName(documentName) {
    const parts = documentName.split(":");

    if (parts[0] === "blog") {
        return { type: "blog", blogId: parts[1] };
    }

    if (parts[0] === "docs") {
        if (parts[1] === "page") {
            if (!parts[2] || !parts[3]) {
                throw new Error(`Invalid docs page name: ${documentName}`);
            }
            return { type: "docs-page", docsId: parts[2], pageId: parts[3] };
        }
        if (parts[1] === "sidebar") {
            if (!parts[2]) {
                throw new Error(`Invalid docs sidebar name: ${documentName}`);
            }
            return { type: "docs-sidebar", docsId: parts[2] };
        }
    }

    throw new Error(`Unknown Doc type: ${documentName}`);
}

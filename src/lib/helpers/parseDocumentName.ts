import { type BuildErrorInput } from "../../types/ws/hocuspocus/AuthenticationErrorTypes.js";
import { CollabDocInfo } from "../../types/ws/hocuspocus/collabHookTypes.js";
import { AuthError } from "../exceptions/AuthException.js";

export function parseCollabDocumentName(documentName: string): CollabDocInfo {
    const parts = documentName.split(":");

    if (parts[0] === "blog") {
        if (!parts[1]) {
            throw buildError({ message: `Invalid blog name: ${documentName}` });
        }
        return { type: "blog", blogId: parts[1] };
    }

    if (parts[0] === "docs") {
        if (parts[1] === "page") {
            if (!parts[2] || !parts[3]) {
                throw buildError({
                    message: `Invalid docs page name: ${documentName}`,
                });
            }
            return { type: "docs-page", docsId: parts[2], pageId: parts[3] };
        }
        if (parts[1] === "sidebar") {
            if (!parts[2]) {
                throw buildError({
                    message: `Invalid docs sidebar name: ${documentName}`,
                });
            }
            return { type: "docs-sidebar", docsId: parts[2] };
        }
    }
    throw buildError({ message: `Unknown doc type: ${documentName}` });
}

function buildError({
    message = "Document not found",
    code = "NOT_FOUND",
    httpStatus = 404,
    wsCode = 4404,
    reason = "NOT_FOUND",
}: BuildErrorInput = {}) {
    return new AuthError({
        message: message,
        code: code,
        httpStatus: httpStatus,
        wsCode: wsCode,
        reason: reason,
    });
}

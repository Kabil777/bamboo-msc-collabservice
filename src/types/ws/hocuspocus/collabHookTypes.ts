import { type Doc as YjsDocument } from "yjs";
export type CollabDocInfo =
    | { type: "blog"; blogId: string }
    | { type: "docs-page"; docsId: string; pageId: string }
    | { type: "docs-sidebar"; docsId: string };

export type updateArgs = {
    documentName: string;
    document: YjsDocument;
    info: CollabDocInfo;
};

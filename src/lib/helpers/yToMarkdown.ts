import { TiptapTransformer } from "@hocuspocus/transformer";
import { schemaExtensions } from "./tip-tapExtenstions.js";
import { renderToMarkdown } from "@tiptap/static-renderer";
import { Doc } from "yjs";

function normalizeMarkdownContent(value: unknown): string {
    if (typeof value === "string") {
        return value;
    }

    if (value == null) {
        return "";
    }

    return JSON.stringify(value);
}

export function generateMarkdown(doc: Doc): string {
    const json = TiptapTransformer.fromYdoc(doc, "default");
    const data = renderToMarkdown({
        extensions: schemaExtensions,
        content: json || {},
    });
    return normalizeMarkdownContent(data);
}

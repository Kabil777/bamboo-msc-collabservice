import { TiptapTransformer } from "@hocuspocus/transformer";
import { schemaExtensions } from "../utils/tiptap-extenstion.js";
import { renderToMarkdown } from "@tiptap/static-renderer";

export function generateMarkdown(doc) {
    const json = TiptapTransformer.fromYdoc(doc, "default", schemaExtensions);
    console.log(json);
    const data = renderToMarkdown({
        extensions: schemaExtensions,
        content: json || {},
    });
    return data;
}

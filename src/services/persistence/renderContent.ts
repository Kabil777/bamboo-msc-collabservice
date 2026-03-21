import * as Y from "yjs";

function flattenValue(value: unknown): string {
    if (value == null) {
        return "";
    }
    if (typeof value === "string") {
        return value;
    }
    if (value instanceof Y.Text) {
        return value.toString();
    }
    if (value instanceof Y.XmlText) {
        return value.toString();
    }
    if (value instanceof Y.XmlElement || value instanceof Y.XmlFragment) {
        return value
            .toArray()
            .map((child) => flattenValue(child))
            .filter(Boolean)
            .join("");
    }
    if (value instanceof Y.Array) {
        return value
            .toArray()
            .map((entry) => flattenValue(entry))
            .filter(Boolean)
            .join("\n");
    }
    if (value instanceof Y.Map) {
        return Array.from(value.values())
            .map((entry) => flattenValue(entry))
            .filter(Boolean)
            .join("\n");
    }
    if (Array.isArray(value)) {
        return value.map((entry) => flattenValue(entry)).filter(Boolean).join("\n");
    }
    if (typeof value === "object") {
        return Object.values(value as Record<string, unknown>)
            .map((entry) => flattenValue(entry))
            .filter(Boolean)
            .join("\n");
    }
    return String(value);
}

export function renderDocumentContent(doc: Y.Doc): string {
    const defaultText = doc.getText("default").toString().trim();
    if (defaultText) {
        return defaultText;
    }

    const defaultXml = doc.getXmlFragment("default");
    const xmlContent = flattenValue(defaultXml).trim();
    if (xmlContent) {
        return xmlContent;
    }

    return Array.from(doc.share.values())
        .map((value) => flattenValue(value))
        .filter(Boolean)
        .join("\n")
        .trim();
}

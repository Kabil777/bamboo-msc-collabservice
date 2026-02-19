import * as Y from "yjs";
import { logger } from "./logger.js";
import { parseCollabDocumentName } from "#services/persistence/documentNameParser.js";
import { persistDocumentByType } from "#services/persistence/persistDocumentByType.js";

const storeTimers = new Map();
const STORE_DELAY_MS = 2000;

async function persistNow(documentName, document, isSaveReq) {
    try {
        const update = Y.encodeStateAsUpdate(document);
        const meta = document.getMap("meta");

        const info = parseCollabDocumentName(documentName);

        await persistDocumentByType(info, document, update, isSaveReq);

        meta.set("lastPersistedAt", Date.now());
        return { ok: true };
    } catch (err) {
        logger.error({ documentName, err }, "Persist failed");
        return { ok: false, err };
    } finally {
        storeTimers.delete(documentName);
    }
}

export function scheduleStore(documentName, document, isSaveReq = false) {
    const key = documentName;

    if (storeTimers.has(key)) {
        clearTimeout(storeTimers.get(key));
    }
    const timer = setTimeout(() => {
        void persistNow(documentName, document, isSaveReq);
    }, STORE_DELAY_MS);

    storeTimers.set(key, timer);
}

export async function flushStore(documentName, document, isSaveReq = true) {
    if (storeTimers.has(documentName)) {
        clearTimeout(storeTimers.get(documentName));
        storeTimers.delete(documentName);
    }

    const result = await persistNow(documentName, document, isSaveReq);
    if (!result.ok) {
        throw result.err ?? new Error("Persist failed");
    }
}

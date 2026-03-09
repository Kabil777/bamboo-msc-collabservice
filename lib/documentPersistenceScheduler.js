import * as Y from "yjs";
import { logger } from "./logger.js";
import { parseCollabDocumentName } from "#services/persistence/documentNameParser.js";
import { persistDocumentByType } from "#services/persistence/persistDocumentByType.js";

const storeTimers = new Map();
const inFlight = new Map();
const retryCounts = new Map();
const STORE_DELAY_MS = 2000;
const RETRY_DELAY_MS = 3000;
const MAX_RETRY_ATTEMPTS = 3;

function scheduleRetry(documentName, document, isSaveReq, onComplete) {
    const attempts = retryCounts.get(documentName) ?? 0;
    if (attempts >= MAX_RETRY_ATTEMPTS) {
        return;
    }

    retryCounts.set(documentName, attempts + 1);
    const timer = setTimeout(() => {
        void persistNow(documentName, document, isSaveReq, onComplete);
    }, RETRY_DELAY_MS);
    storeTimers.set(documentName, timer);
}

async function persistNow(documentName, document, isSaveReq, onComplete) {
    if (inFlight.has(documentName)) {
        return inFlight.get(documentName);
    }

    const task = (async () => {
        try {
            storeTimers.delete(documentName);
            const update = Y.encodeStateAsUpdate(document);
            const meta = document.getMap("meta");
            meta.set("saveStatus", "SAVING");

            const info = parseCollabDocumentName(documentName);

            await persistDocumentByType(info, document, update, isSaveReq);

            meta.set("lastPersistedAt", Date.now());
            meta.set("saveStatus", "SAVED");
            retryCounts.delete(documentName);
            return { ok: true };
        } catch (err) {
            document.getMap("meta").set("saveStatus", "FAILED");
            scheduleRetry(documentName, document, isSaveReq, onComplete);
            logger.error({ documentName, err }, "Persist failed");
            return { ok: false, err };
        } finally {
            inFlight.delete(documentName);
            if (typeof onComplete === "function") {
                try {
                    onComplete();
                } catch (_e) {
                    // ignore callback errors
                }
            }
        }
    })();

    inFlight.set(documentName, task);
    return task;
}

export function scheduleStore(
    documentName,
    document,
    isSaveReq = false,
    onComplete,
) {
    const key = documentName;

    if (storeTimers.has(key)) {
        clearTimeout(storeTimers.get(key));
    }
    retryCounts.delete(key);
    const timer = setTimeout(() => {
        void persistNow(documentName, document, isSaveReq, onComplete);
    }, STORE_DELAY_MS);

    storeTimers.set(key, timer);
}

export async function flushStore(
    documentName,
    document,
    isSaveReq = true,
    onComplete,
) {
    if (storeTimers.has(documentName)) {
        clearTimeout(storeTimers.get(documentName));
        storeTimers.delete(documentName);
    }
    retryCounts.delete(documentName);

    const result = await persistNow(documentName, document, isSaveReq, onComplete);
    if (!result.ok) {
        throw result.err ?? new Error("Persist failed");
    }
}

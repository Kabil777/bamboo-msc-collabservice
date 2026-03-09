import * as Y from "yjs";
import { logger } from "#lib/logger.js";
import { pool } from "#lib/postgresPool.js";
import { flushStore } from "../../../lib/documentPersistenceScheduler.js";
import { saveDocsPage } from "./saveDocsPageContent.js";
import { generateMarkdown } from "#lib/yDocToMarkdown.js";
import {
    enqueueCanonicalSyncJob,
    processCanonicalSyncJob,
} from "#lib/canonicalSyncOutbox.js";

function extractPageIdsFromSidebar(doc) {
    try {
        const pages = doc.getArray("pages");
        return pages
            .toArray()
            .map((page) => page?.get?.("id"))
            .filter((id) => typeof id === "string" && id.length > 0);
    } catch {
        return [];
    }
}

async function loadSidebarDocFromDb(docsId) {
    const { rows } = await pool.query(
        `SELECT yjs_state FROM docs_sidebar_state WHERE docs_id = $1`,
        [docsId],
    );
    if (rows.length === 0 || !rows[0].yjs_state) {
        return null;
    }
    const doc = new Y.Doc();
    Y.applyUpdate(doc, rows[0].yjs_state);
    return doc;
}

function buildTreeFromSidebar(doc, pageMarkdownById) {
    const pages = doc.getArray("pages");
    const nodes = pages
        .toArray()
        .map((p) => ({
            id: p.get("id"),
            title: p.get("title"),
            parentId: p.get("parentId"),
            level: p.get("level"),
            order: p.get("order"),
            isRoot: p.get("isRoot"),
        }))
        .filter((n) => typeof n.id === "string" && n.id.length > 0);

    const top = nodes.filter((n) => n.level === 0);
    const subs = nodes.filter((n) => n.level === 1);

    return top.map((page) => ({
        id: page.id,
        title: page.title || "Untitled",
        content: pageMarkdownById.get(page.id) || "",
        subTree: subs
            .filter((s) => s.parentId === page.id)
            .map((s) => ({
                id: s.id,
                title: s.title || "Untitled",
                content: pageMarkdownById.get(s.id) || "",
                subTree: [],
            })),
    }));
}

async function getPageStatesFromDb(pageIds) {
    if (!pageIds.length) return new Map();
    const { rows } = await pool.query(
        `SELECT page_id, markdown, yjs_state
         FROM docs_page_state
         WHERE page_id = ANY($1)`,
        [pageIds],
    );
    const map = new Map();
    rows.forEach((row) => {
        map.set(String(row.page_id), {
            markdown: row.markdown,
            yjs_state: row.yjs_state,
        });
    });
    return map;
}

async function getPageStateFromDb(pageId) {
    const { rows } = await pool.query(
        `SELECT page_id, markdown, yjs_state
         FROM docs_page_state
         WHERE page_id = $1`,
        [pageId],
    );

    if (!rows.length) {
        return null;
    }

    return {
        markdown: rows[0].markdown,
        yjs_state: rows[0].yjs_state,
    };
}

export async function saveDocsAll(docsId, collabServer, publishMeta = {}) {
    try {
        const sidebarName = `docs:sidebar:${docsId}`;
        const liveSidebar =
            collabServer?.hocuspocus?.documents?.get(sidebarName) || null;

        if (liveSidebar) {
            await flushStore(sidebarName, liveSidebar, false);
        }

        const sidebarDoc = liveSidebar || (await loadSidebarDocFromDb(docsId));
        if (!sidebarDoc) {
            return { ok: false, reason: "not_found" };
        }

        const pageIds = extractPageIdsFromSidebar(sidebarDoc);
        if (pageIds.length === 0) {
            return { ok: false, reason: "not_found" };
        }

        let savedPages = 0;
        const pageMarkdownById = new Map();
        const dbStatesById = await getPageStatesFromDb(pageIds);
        for (const pageId of pageIds) {
            const pageName = `docs:page:${docsId}:${pageId}`;
            const livePage =
                collabServer?.hocuspocus?.documents?.get(pageName) || null;

            if (livePage) {
                await flushStore(pageName, livePage, true);
                const freshDbState = await getPageStateFromDb(pageId);
                if (freshDbState?.markdown) {
                    pageMarkdownById.set(pageId, freshDbState.markdown);
                } else {
                    const dbState = dbStatesById.get(pageId);
                    if (dbState?.markdown) {
                        pageMarkdownById.set(pageId, dbState.markdown);
                    } else if (dbState?.yjs_state) {
                        const doc = new Y.Doc();
                        Y.applyUpdate(doc, dbState.yjs_state);
                        pageMarkdownById.set(pageId, generateMarkdown(doc));
                    }
                }
                savedPages += 1;
                continue;
            }

            const result = await saveDocsPage(pageId);
            if (result.ok) {
                const dbState = dbStatesById.get(pageId);
                if (dbState?.markdown) {
                    pageMarkdownById.set(pageId, dbState.markdown);
                } else if (dbState?.yjs_state) {
                    const doc = new Y.Doc();
                    Y.applyUpdate(doc, dbState.yjs_state);
                    pageMarkdownById.set(pageId, generateMarkdown(doc));
                }
                savedPages += 1;
            }
        }

        const tree = buildTreeFromSidebar(sidebarDoc, pageMarkdownById);
        const meta = sidebarDoc?.getMap("meta");
        const visibility = publishMeta.visibility ?? meta?.get("publishVisibility");
        const status = publishMeta.status ?? meta?.get("publishStatus");
        const request = {
            tree,
            pages: Array.from(pageMarkdownById.entries()).map(
                ([pageId, markdown]) => ({
                    pageId,
                    markdown,
                }),
            ),
            visibility,
            status,
        };
        const client = await pool.connect();
        let committed = false;

        try {
            await client.query("BEGIN");
            const jobKey = await enqueueCanonicalSyncJob(
                {
                    resourceType: "docs",
                    resourceId: docsId,
                    payload: {
                        request,
                        userId: publishMeta.userId,
                    },
                },
                client,
            );
            await client.query("COMMIT");
            committed = true;

            const syncResult = await processCanonicalSyncJob(jobKey);
            if (!syncResult.ok) {
                return {
                    ok: true,
                    source: liveSidebar ? "live-doc" : "db",
                    pages: savedPages,
                    queued: true,
                };
            }
        } catch (error) {
            if (!committed) {
                await client.query("ROLLBACK");
            }
            throw error;
        } finally {
            client.release();
        }

        return {
            ok: true,
            source: liveSidebar ? "live-doc" : "db",
            pages: savedPages,
            queued: false,
        };
    } catch (e) {
        logger.error({ docsId, err: e }, "saveDocsAll failed");
        return { ok: false, reason: "error" };
    }
}

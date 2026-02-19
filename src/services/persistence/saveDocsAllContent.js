import * as Y from "yjs";
import { logger } from "#lib/logger.js";
import { pool } from "#lib/postgresPool.js";
import { flushStore } from "../../../lib/documentPersistenceScheduler.js";
import { saveDocsPage } from "./saveDocsPageContent.js";
import { generateMarkdown } from "#lib/yDocToMarkdown.js";
import { DocsClient } from "../../../api/docs-client.js";

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

export async function saveDocsAll(docsId, collabServer) {
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
                const meta = livePage.getMap("meta");
                const isDirty = meta.get("dirty") === true;
                const markdown = isDirty ? generateMarkdown(livePage) : null;

                if (markdown != null) {
                    pageMarkdownById.set(pageId, markdown);
                    meta.set("dirty", false);
                } else {
                    const dbState = dbStatesById.get(pageId);
                    if (dbState?.markdown) {
                        pageMarkdownById.set(pageId, dbState.markdown);
                    }
                }

                await flushStore(pageName, livePage, true);
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
        await DocsClient.saveDocsContent(docsId, {
            tree,
            pages: Array.from(pageMarkdownById.entries()).map(
                ([pageId, markdown]) => ({
                    pageId,
                    markdown,
                }),
            ),
        });

        return {
            ok: true,
            source: liveSidebar ? "live-doc" : "db",
            pages: savedPages,
        };
    } catch (e) {
        logger.error({ docsId, err: e }, "saveDocsAll failed");
        return { ok: false, reason: "error" };
    }
}

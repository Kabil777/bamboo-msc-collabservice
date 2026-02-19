import { logger } from "#lib/logger.js";
import { pool } from "#lib/postgresPool.js";
import { generateMarkdown } from "#lib/yDocToMarkdown.js";
import * as Y from "yjs";

export async function saveDocsPage(pageId) {
    try {
        const { rows } = await pool.query(
            `
        SELECT markdown, yjs_state
        FROM docs_page_state
        WHERE page_id = $1
        `,
            [pageId],
        );

        if (rows.length === 0) {
            return { ok: false, reason: "not_found" };
        }

        let markdown = rows[0].markdown;

        // Fallback: render markdown only when saving if cache is empty.
        if (markdown == null && rows[0].yjs_state != null) {
            const doc = new Y.Doc();
            Y.applyUpdate(doc, rows[0].yjs_state);
            markdown = generateMarkdown(doc);

            await pool.query(
                `
                UPDATE docs_page_state
                SET markdown = $2, updated_at = now()
                WHERE page_id = $1
                `,
                [pageId, markdown],
            );
        }

        if (markdown == null) {
            return { ok: false, reason: "not_found" };
        }

        return { ok: true, source: "db" };
    } catch (e) {
        logger.error({ pageId, err: e }, "saveDocsPage failed");
        return { ok: false, reason: "error" };
    }
}

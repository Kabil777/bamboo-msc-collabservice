import { logger } from "#lib/logger.js";
import { pool } from "#lib/postgresPool.js";
import { generateMarkdown } from "#lib/yDocToMarkdown.js";
import { BlogClient } from "../../../api/blog-client.js";
import * as Y from "yjs";

export async function saveBlog(id) {
    try {
        const { rows } = await pool.query(
            `
        SELECT markdown, yjs_state
        FROM blog_collab_state
        WHERE blog_id = $1
        `,
            [id],
        );

        if (rows.length === 0) {
            return { ok: false, reason: "not_found" };
        }

        let markdown = rows[0].markdown;

        // Fallback: render markdown only when publishing if cache is empty.
        if (markdown == null && rows[0].yjs_state != null) {
            const doc = new Y.Doc();
            Y.applyUpdate(doc, rows[0].yjs_state);
            markdown = generateMarkdown(doc);

            await pool.query(
                `
                UPDATE blog_collab_state
                SET markdown = $2, updated_at = now()
                WHERE blog_id = $1
                `,
                [id, markdown],
            );
        }

        if (markdown == null) {
            return { ok: false, reason: "not_found" };
        }

        await BlogClient.savePost(id, markdown);
        return { ok: true, source: "db" };
    } catch (e) {
        logger.error({ id, err: e }, "saveBlog failed");
        return { ok: false, reason: "error" };
    }
}

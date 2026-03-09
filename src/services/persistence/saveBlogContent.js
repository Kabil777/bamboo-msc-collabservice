import { logger } from "#lib/logger.js";
import { pool } from "#lib/postgresPool.js";
import { generateMarkdown } from "#lib/yDocToMarkdown.js";
import {
    enqueueCanonicalSyncJob,
    processCanonicalSyncJob,
} from "#lib/canonicalSyncOutbox.js";
import * as Y from "yjs";

export async function saveBlog(id, publishMeta = {}) {
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

        const client = await pool.connect();
        let committed = false;

        try {
            await client.query("BEGIN");
            const jobKey = await enqueueCanonicalSyncJob(
                {
                    resourceType: "blog",
                    resourceId: id,
                    payload: {
                        markdown,
                        visibility: publishMeta.visibility,
                        status: publishMeta.status,
                        userId: publishMeta.userId,
                    },
                },
                client,
            );
            await client.query("COMMIT");
            committed = true;

            const syncResult = await processCanonicalSyncJob(jobKey);
            if (!syncResult.ok) {
                return { ok: true, source: "db", queued: true };
            }

            return { ok: true, source: "db", queued: false };
        } catch (error) {
            if (!committed) {
                await client.query("ROLLBACK");
            }
            throw error;
        } finally {
            client.release();
        }
    } catch (e) {
        logger.error({ id, err: e }, "saveBlog failed");
        return { ok: false, reason: "error" };
    }
}

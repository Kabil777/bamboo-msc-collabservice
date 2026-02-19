import * as Y from "yjs";
import { pool } from "#lib/postgresPool.js";

export const loadBlogDocument = async (id, document) => {
    const { rows } = await pool.query(
        `SELECT yjs_state FROM blog_collab_state WHERE blog_id = $1`,
        [id],
    );

    if (rows.length > 0) {
        Y.applyUpdate(document, rows[0].yjs_state);
    }

    const meta = document.getMap("meta");
    if (!meta.has("lastPersistedAt")) meta.set("lastPersistedAt", 0);
    if (!meta.has("saveRequestedAt")) meta.set("saveRequestedAt", 0);

    return document;
};

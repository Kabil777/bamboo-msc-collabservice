import { pool } from "#lib/postgresPool.js";
import { generateMarkdown } from "#lib/yDocToMarkdown.js";
import { BlogClient } from "../../../api/blog-client.js";

export async function persistDocsPageState(pageId, document, update) {
    const markdown = generateMarkdown(document);

    await pool.query(
        `
        INSERT INTO docs_page_state (page_id, yjs_state, markdown)
        VALUES ($1, $2, $3)
        ON CONFLICT (page_id)
        DO UPDATE SET
          yjs_state = EXCLUDED.yjs_state,
          markdown = EXCLUDED.markdown,
          updated_at = now()
        `,
        [pageId, update, markdown],
    );
}

export async function persistDocsSidebarState(docsId, update) {
    await pool.query(
        `
        INSERT INTO docs_sidebar_state (docs_id, yjs_state)
        VALUES ($1, $2)
        ON CONFLICT (docs_id)
        DO UPDATE SET
          yjs_state = EXCLUDED.yjs_state,
          updated_at = now()
        `,
        [docsId, update],
    );
}

export async function persistBlogState(blogId, document, update, isSaveReq) {
    if (!isSaveReq) {
        await pool.query(
            `
            INSERT INTO blog_collab_state(blog_id, yjs_state)
            VALUES ($1, $2)
            ON CONFLICT (blog_id)
            DO UPDATE SET
              yjs_state = EXCLUDED.yjs_state,
              updated_at = now()
            `,
            [blogId, update],
        );
        return;
    }

    const markdown = generateMarkdown(document);

    await pool.query(
        `  
        INSERT INTO blog_collab_state(blog_id,yjs_state,markdown)
        VALUES (
            $1,$2,$3
        ) ON CONFLICT (blog_id)
        DO UPDATE SET
          yjs_state = EXCLUDED.yjs_state,
          markdown = EXCLUDED.markdown,
          updated_at = now()
        `,
        [blogId, update, markdown],
    );

    await BlogClient.savePost(blogId, markdown);
}

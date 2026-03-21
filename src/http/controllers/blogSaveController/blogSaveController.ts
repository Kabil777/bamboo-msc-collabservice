import { PostCommandClient } from "../../../api/postClient/CommandClient.js";
import { PostRoleClient } from "../../../api/postClient/RoleClient.js";
import { AuthError } from "../../../lib/exceptions/AuthException.js";
import { parseRequestUser } from "../../../lib/helpers/requestUser.js";
import { validateToken } from "../../../lib/helpers/validateToken.js";
import { generateMarkdown } from "../../../lib/helpers/yToMarkdown.js";
import { JwtHelper } from "../../../lib/jwt.js";
import { logger } from "../../../lib/logger.js";
import { BlogStateRepository } from "../../../repository/collab/BlogStateRepository.js";
import { CollabServer } from "../../../ws/servers/CollabServer.js";
import type { Request, Response } from "express";
import { Express } from "express";
import * as Y from "yjs";

export type PostStatus = "PUBLISHED" | "ARCHIVED" | "DRAFT";
export type Visibility = "PUBLIC" | "PRIVATE";
export interface blogSaveType {
    content: string;
    visibility?: Visibility;
    status?: PostStatus;
}

export class BlogSaveController {
    private readonly roleClient: PostRoleClient;
    private readonly postClient: PostCommandClient;
    private readonly blogStateRepository: BlogStateRepository;
    private readonly jwtHelper: JwtHelper;
    private readonly app: Express;
    private readonly collabServer: CollabServer;

    constructor(collabServer: CollabServer, app: Express) {
        this.roleClient = PostRoleClient.create();
        this.postClient = PostCommandClient.create();
        this.blogStateRepository = new BlogStateRepository();
        this.jwtHelper = new JwtHelper();
        this.app = app;
        this.collabServer = collabServer;
    }

    public registerRoutes(): void {
        this.app.post("/api/blog/save/:id", this.handleSaveBlog);
    }
    handleSaveBlog = async (req: Request<{ id: string }>, res: Response) => {
        try {
            const { id } = req.params;
            const { visibility, status } = req.body || {};
            const documentName = `blog:${id}`;

            const currentUser = await validateToken(this.jwtHelper, req);
            await parseRequestUser(this.roleClient, id, {
                id: currentUser.id,
            });
            logger.info(
                { blogId: id, userId: currentUser.id, visibility, status },
                "blog save requested",
            );

            const liveDocument = this.collabServer
                .getInstance()
                .hocuspocus.documents.get(documentName);

            if (liveDocument) {
                const saveData: blogSaveType = {
                    content: generateMarkdown(liveDocument),
                    status,
                    visibility,
                };

                await this.postClient.saveBlogContent(
                    id,
                    saveData,
                    currentUser.id,
                );
                logger.info(
                    { blogId: id, userId: currentUser.id, source: "live-doc" },
                    "blog save completed",
                );

                return res.status(200).json({
                    ok: true,
                    message: "Blog saved successfully",
                });
            }

            const document =
                await this.blogStateRepository.getBlogStateById(id);
            if (!document) {
                return res.status(400).json({
                    ok: false,
                    reason: "Failed to lookup document",
                    message: "",
                });
            }

            const ydoc = new Y.Doc();
            Y.applyUpdate(ydoc, document);
            const saveData: blogSaveType = {
                content: generateMarkdown(ydoc),
                status,
                visibility,
            };

            await this.postClient.saveBlogContent(id, saveData, currentUser.id);
            logger.info(
                { blogId: id, userId: currentUser.id, source: "db" },
                "blog save completed",
            );

            return res.status(200).json({
                ok: true,
                message: "Blog saved successfully",
            });
        } catch (error) {
            if (error instanceof AuthError) {
                return res.status(error.httpStatus).json({
                    ok: false,
                    reason: error.reason,
                    message: error.message,
                });
            }

            logger.error({ err: error }, "blog save failed");

            return res.status(500).json({
                ok: false,
                message: "Save failed",
            });
        }
    };

}

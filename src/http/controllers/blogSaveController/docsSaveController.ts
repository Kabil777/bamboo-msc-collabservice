import { PostCommandClient } from "../../../api/postClient/CommandClient.js";
import { PostRoleClient } from "../../../api/postClient/RoleClient.js";
import { AuthError } from "../../../lib/exceptions/AuthException.js";
import { saveDocs } from "../../../lib/helpers/saveDocsHelper.js";
import { validateToken } from "../../../lib/helpers/validateToken.js";
import { JwtHelper } from "../../../lib/jwt.js";
import { logger } from "../../../lib/logger.js";
import { DocsSidebarStateRepository } from "../../../repository/collab/DocsSideBarState.js";
import { DocsStateRepository } from "../../../repository/collab/DocsStateRepository.js";
import { CollabServer } from "../../../ws/servers/CollabServer.js";
import { Express, Request, Response } from "express";

export class DocsController {
    private readonly roleClient: PostRoleClient;
    private readonly postClient: PostCommandClient;
    private readonly docsRepository: DocsStateRepository;
    private readonly docsSidebarRrepository: DocsSidebarStateRepository;
    private readonly app: Express;
    private readonly collabServer: CollabServer;
    private readonly jwtHelper: JwtHelper;

    constructor(app: Express, collabServer: CollabServer) {
        this.roleClient = PostRoleClient.create();
        this.postClient = PostCommandClient.create();
        this.docsRepository = new DocsStateRepository();
        this.docsSidebarRrepository = new DocsSidebarStateRepository();
        this.jwtHelper = new JwtHelper();
        this.app = app;
        this.collabServer = collabServer;
    }

    public registerRoutes(): void {
        this.app.post("/api/docs/save/:id", this.handleSaveDocs);
    }

    handleSaveDocs = async (req: Request<{ id: string }>, res: Response) => {
        try {
            const { id } = req.params;
            const { visibility, status } = req.body || {};

            const currentUser = await validateToken(this.jwtHelper, req);
            const requestedUser = await this.roleClient.getDocsRole(
                id,
                currentUser.id,
            );

            if (!requestedUser.ok || requestedUser.role !== "OWNER") {
                throw new AuthError({
                    message:
                        requestedUser.message || "Only owner can save docs",
                    httpStatus: requestedUser.httpStatus || 403,
                    reason: "FORBIDDEN",
                });
            }

            logger.info(
                { docsId: id, userId: currentUser.id, visibility, status },
                "docs save requested",
            );

            const savePayload = await saveDocs({
                docId: id,
                visibility,
                status,
                ownerId: currentUser.id,
                collabServer: this.collabServer,
                docsRepository: this.docsRepository,
                docsSideBarRepository: this.docsSidebarRrepository,
            });

            if (!savePayload) {
                return res.status(400).json({
                    ok: false,
                    reason: "Failed to lookup docs state",
                    message: "",
                });
            }

            await this.postClient.saveDocsContent(
                id,
                savePayload,
                currentUser.id,
            );
            logger.info(
                { docsId: id, userId: currentUser.id },
                "docs save completed",
            );

            return res.status(200).json({
                ok: true,
                message: "Docs saved successfully",
            });
        } catch (error) {
            if (error instanceof AuthError) {
                return res.status(error.httpStatus).json({
                    ok: false,
                    reason: error.reason,
                    message: error.message,
                });
            }

            logger.error({ err: error }, "docs save failed");

            return res.status(500).json({
                ok: false,
                message: "Save failed",
            });
        }
    };

}

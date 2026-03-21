import { IncomingMessage } from "node:http";
import * as Y from "yjs";
import { type Doc as YDocument } from "yjs";
import {
    AuthError,
    normalizeAuthError,
} from "../../lib/exceptions/AuthException.js";
import { JwtHelper } from "../../lib/jwt.js";
import {
    OnAuthenticateResult,
    OnAuthenticationArgs,
} from "../../types/ws/hocuspocus/onAuthenticateTypes.js";
import { JWTPayload } from "jose";
import { PostRoleClient } from "../../api/postClient/RoleClient.js";
import { buildAuthUser } from "../../lib/helpers/buildAuthUser.js";
import { parseCollabDocumentName } from "../../lib/helpers/parseDocumentName.js";
import { BlogStateRepository } from "../../repository/collab/BlogStateRepository.js";
import { DocsStateRepository } from "../../repository/collab/DocsStateRepository.js";
import { DocsSidebarStateRepository } from "../../repository/collab/DocsSideBarState.js";
import { onAuthenticatePayload } from "@hocuspocus/server";
import { logger } from "../../lib/logger.js";

type onUpgradeArgs = {
    request: IncomingMessage;
};
type onLoadDocumentArgs = {
    documentName: string;
    document: YDocument;
};
type OnDisconnectArgs = {
    documentName: string;
    document: YDocument;
    clientsCount: number;
};

type PersistArgs =
    | { type: "blog"; blogId: string; yjsState: Uint8Array }
    | {
          type: "docs-page";
          docsId: string;
          pageId: string;
          yjsState: Uint8Array;
      }
    | { type: "docs-sidebar"; docsId: string; yjsState: Uint8Array };

export class HocuspocusHooks {
    private readonly jwtHelper: JwtHelper;
    private readonly blogStateRepository: BlogStateRepository;
    private readonly docsStateRepository: DocsStateRepository;
    private readonly docsSidebarStateRepository: DocsSidebarStateRepository;

    constructor() {
        this.jwtHelper = new JwtHelper();
        this.blogStateRepository = new BlogStateRepository();
        this.docsStateRepository = new DocsStateRepository();
        this.docsSidebarStateRepository = new DocsSidebarStateRepository();
    }

    private async persistByType(args: PersistArgs): Promise<void> {
        if (args.type === "blog") {
            await this.blogStateRepository.saveBlogStateById(
                args.blogId,
                args.yjsState,
            );
            return;
        }
        if (args.type === "docs-page") {
            await this.docsStateRepository.saveDocsStateById(
                args.pageId,
                args.docsId,
                args.yjsState,
            );
            return;
        }
        await this.docsSidebarStateRepository.saveDocsSidebarStateById(
            args.docsId,
            args.yjsState,
        );
    }

    public async onUpgrade({ request }: onUpgradeArgs) {
        const token = this.jwtHelper.parseJwtFromRequest(request);
        if (!token) {
            throw new AuthError({
                message: "Missing access token",
                code: "MISSING_TOKEN",
                httpStatus: 401,
                wsCode: 4401,
                reason: "MISSING_TOKEN",
            });
        }
        try {
            await this.jwtHelper.verifyAccessToken(token);
        } catch (error: unknown) {
            throw normalizeAuthError(error);
        }
    }

    public async onAuthenticate(
        data: onAuthenticatePayload,
    ): Promise<OnAuthenticateResult> {
        const { request, documentName, connectionConfig } = data;
        const token = this.jwtHelper.parseJwtFromRequest(request);

        if (!token) {
            throw new AuthError({
                message: "Missing access token",
                code: "MISSING_TOKEN",
                httpStatus: 401,
                wsCode: 4401,
                reason: "MISSING_TOKEN",
            });
        }
        let userPayload: JWTPayload;
        try {
            userPayload = await this.jwtHelper.verifyAccessToken(token);
        } catch (error: unknown) {
            throw normalizeAuthError(error);
        }

        const userId =
            typeof userPayload.id === "string"
                ? userPayload.id
                : typeof userPayload.sub === "string"
                  ? userPayload.sub
                  : null;

        if (!userId) {
            throw new AuthError({
                code: "INVALID_TOKEN",
                message: "Missing user id",
            });
        }
        try {
            const docInfo = parseCollabDocumentName(documentName);
            logger.info(
                {
                    documentName,
                    docType: docInfo.type,
                    userId,
                },
                "onAuthenticate role lookup start",
            );
            const userRole =
                docInfo.type === "blog"
                    ? await PostRoleClient.create().getBlogRole(
                          docInfo.blogId,
                          userId,
                      )
                    : await PostRoleClient.create().getDocsRole(
                          docInfo.docsId,
                          userId,
                      );

            if (!userRole.ok) {
                throw new AuthError({
                    message: userRole.message || "Forbidden",
                    code: "FORBIDDEN",
                    httpStatus: 403,
                    wsCode: 4403,
                    reason: "FORBIDDEN",
                });
            }

            const user = buildAuthUser(userPayload);

            connectionConfig.readOnly = userRole.readOnly;
            logger.info(
                {
                    documentName,
                    role: userRole.role,
                    readOnly: userRole.readOnly,
                    userId,
                },
                "onAuthenticate role lookup success",
            );

            return {
                user,
                role: userRole.role,
                tokenExpiresAt: user.tokenExpiresAt,
            };
        } catch (error) {
            if (error instanceof AuthError) {
                logger.warn(
                    {
                        documentName,
                        message: error.message,
                        code: error.code,
                        httpStatus: error.httpStatus,
                    },
                    "onAuthenticate auth error",
                );
                throw error;
            }
            logger.error(
                {
                    documentName,
                    err:
                        error instanceof Error
                            ? { name: error.name, message: error.message }
                            : error,
                },
                "onAuthenticate unexpected error",
            );
            throw new AuthError({
                message: "Forbidden",
                code: "FORBIDDEN",
                httpStatus: 403,
                wsCode: 4403,
                reason: "FORBIDDEN",
            });
        }
    }

    public async onLoadDocument({
        documentName,
        document,
    }: onLoadDocumentArgs): Promise<YDocument> {
        const type = parseCollabDocumentName(documentName);

        if (type.type === "blog") {
            await this.blogStateRepository.ensureBlogState(
                type.blogId,
                document,
            );
            const yjsState = await this.blogStateRepository.getBlogStateById(
                type.blogId,
            );
            if (yjsState) Y.applyUpdate(document, yjsState);
            return document;
        }
        if (type.type === "docs-page") {
            const yjsState = await this.docsStateRepository.getDocsStateById(
                type.pageId,
            );
            if (yjsState) Y.applyUpdate(document, yjsState);
            return document;
        }
        if (type.type === "docs-sidebar") {
            const yjsState =
                await this.docsSidebarStateRepository.getDocsSidebarStateById(
                    type.docsId,
                );
            if (yjsState) Y.applyUpdate(document, yjsState);
            return document;
        }

        return document;
    }

    async onChange({ documentName, document }: onLoadDocumentArgs) {
        const info = parseCollabDocumentName(documentName);

        if (info.type === "blog") {
            await this.blogStateRepository.updateBlog({
                documentName,
                document,
                info,
            });
            return;
        }
        if (info.type === "docs-page") {
            await this.docsStateRepository.updateDocsPage({
                documentName,
                document,
                info,
            });
        }

        if (info.type === "docs-sidebar") {
            await this.docsSidebarStateRepository.updateDocsPage({
                documentName,
                document,
                info,
            });
        }
    }

    async onDisconnect({
        documentName,
        document,
        clientsCount,
    }: OnDisconnectArgs) {
        if (clientsCount === 0) {
            const info = parseCollabDocumentName(documentName);
            const yjsState = Y.encodeStateAsUpdate(document);

            if (info.type === "blog") {
                await this.persistByType({
                    type: "blog",
                    blogId: info.blogId,
                    yjsState,
                });
                return;
            }

            if (info.type === "docs-page") {
                await this.persistByType({
                    type: "docs-page",
                    docsId: info.docsId,
                    pageId: info.pageId,
                    yjsState,
                });
                return;
            }

            await this.persistByType({
                type: "docs-sidebar",
                docsId: info.docsId,
                yjsState,
            });
        }
    }
}

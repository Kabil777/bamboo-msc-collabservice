import { getAccessTokenFromRequest } from "#lib/cookieParser.js";
import { AuthError, normalizeAuthError } from "#lib/authError.js";
import { verifyAccessToken } from "#lib/jwt.js";
import { RoleClient } from "../../api/role-client.js";
import {
    flushStore,
    scheduleStore,
} from "../../lib/documentPersistenceScheduler.js";
import { parseCollabDocumentName } from "../services/persistence/documentNameParser.js";
import { loadBlogDocument } from "../services/documentLoaders/blogDocumentLoader.js";
import {
    loadDocsPageDocument,
    loadDocsSidebarDocument,
} from "../services/documentLoaders/docsDocumentLoader.js";
import { FIVE_MIN } from "./config.js";

const ROLE_CACHE_TTL_MS = 30_000;
const roleCache = new Map();

function getRoleCacheKey(userId, documentName) {
    return `${userId}:${documentName}`;
}

async function resolveBlogRole(userId, blogId) {
    const { data } = await RoleClient.getBlogRole(blogId, userId);
    return data;
}

async function resolveDocsRole(userId, docsId) {
    const { data } = await RoleClient.getDocsRole(docsId, userId);
    return data;
}

async function resolveRoleForDocument(userId, documentName) {
    const cacheKey = getRoleCacheKey(userId, documentName);
    const cached = roleCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached;
    }

    const info = parseCollabDocumentName(documentName);

    if (info.type === "blog") {
        const roleResponse = await resolveBlogRole(userId, info.blogId);
        if (!roleResponse?.ok) {
            throw new AuthError({
                message: "Forbidden",
                code: "FORBIDDEN",
                httpStatus: 403,
                wsCode: 4403,
                reason: "FORBIDDEN",
            });
        }

        const resolved = {
            readOnly: Boolean(roleResponse.readOnly),
            role: roleResponse.role,
        };

        roleCache.set(cacheKey, {
            ...resolved,
            expiresAt: Date.now() + ROLE_CACHE_TTL_MS,
        });

        return resolved;
    }

    if (info.type === "docs-page" || info.type === "docs-sidebar") {
        const roleResponse = await resolveDocsRole(userId, info.docsId);
        if (!roleResponse?.ok) {
            throw new AuthError({
                message: "Forbidden",
                code: "FORBIDDEN",
                httpStatus: 403,
                wsCode: 4403,
                reason: "FORBIDDEN",
            });
        }

        const resolved = {
            readOnly: Boolean(roleResponse.readOnly),
            role: roleResponse.role,
        };

        roleCache.set(cacheKey, {
            ...resolved,
            expiresAt: Date.now() + ROLE_CACHE_TTL_MS,
        });

        return resolved;
    }

    const fallback = { readOnly: false, role: "owner" };
    roleCache.set(cacheKey, {
        ...fallback,
        expiresAt: Date.now() + ROLE_CACHE_TTL_MS,
    });
    return fallback;
}

function assertUnexpiredConnection(context) {
    const tokenExpiresAt = context?.tokenExpiresAt;
    if (!tokenExpiresAt) return;

    if (Date.now() >= tokenExpiresAt) {
        throw new AuthError({
            message: "Access token expired",
            code: "TOKEN_EXPIRED",
            httpStatus: 401,
            wsCode: 4401,
            reason: "TOKEN_EXPIRED",
        });
    }
}

export const collabHooks = {
    async onUpgrade({ request }) {
        const token = getAccessTokenFromRequest(request);
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
            await verifyAccessToken(token);
        } catch (error) {
            throw normalizeAuthError(error);
        }
    },

    async onAuthenticate({ request, documentName, connectionConfig }) {
        const token = getAccessTokenFromRequest(request);
        if (!token) {
            throw new AuthError({
                message: "Missing access token",
                code: "MISSING_TOKEN",
                httpStatus: 401,
                wsCode: 4401,
                reason: "MISSING_TOKEN",
            });
        }

        let user;
        try {
            user = await verifyAccessToken(token);
        } catch (error) {
            throw normalizeAuthError(error);
        }

        try {
            const roleInfo = await resolveRoleForDocument(
                user.id,
                documentName,
            );
            connectionConfig.readOnly = roleInfo.readOnly;
            connectionConfig.user = user;
            connectionConfig.context = {
                user,
                role: roleInfo.role,
                tokenExpiresAt: user.tokenExpiresAt,
            };

            return {
                user,
                role: roleInfo.role,
                tokenExpiresAt: user.tokenExpiresAt,
            };
        } catch (error) {
            if (error instanceof AuthError) {
                throw error;
            }

            throw new AuthError({
                message: "Forbidden",
                code: "FORBIDDEN",
                httpStatus: 403,
                wsCode: 4403,
                reason: "FORBIDDEN",
            });
        }
    },

    async beforeHandleMessage({ context }) {
        assertUnexpiredConnection(context);
    },

    async onLoadDocument({ documentName, document }) {
        const info = parseCollabDocumentName(documentName);

        if (info.type === "blog") {
            return loadBlogDocument(info.blogId, document);
        }

        if (info.type === "docs-page") {
            return loadDocsPageDocument(info.pageId, document);
        }

        if (info.type === "docs-sidebar") {
            return loadDocsSidebarDocument(info.docsId, document);
        }

        return document;
    },

    async onChange({ documentName, document }) {
        const meta = document.getMap("meta");
        const now = Date.now();
        const last = meta.get("lastPersistedAt") ?? 0;
        const saveAt = meta.get("saveRequestedAt");

        if (meta.get("isPersisting")) return;

        if (now - last > FIVE_MIN || saveAt > last) {
            meta.set("isPersisting", true);
            meta.set("lastPersistedAt", now);
            meta.set("saveRequestedAt", 0);

            const isSave = saveAt > last;

            if (documentName.startsWith("docs:page:")) {
                meta.set("dirty", true);
            }

            scheduleStore(documentName, document, isSave, () => {
                meta.set("isPersisting", false);
            });
        }
    },

    async onDisconnect({ documentName, document, clientsCount }) {
        if (clientsCount === 0) {
            // Persist Yjs snapshot on disconnect, but don't publish markdown.
            await flushStore(documentName, document, false);
        }
    },
};

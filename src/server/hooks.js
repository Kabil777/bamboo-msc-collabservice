import { getAccessTokenFromRequest } from "#lib/cookieParser.js";
import { AuthError, normalizeAuthError } from "#lib/authError.js";
import { verifyAccessToken } from "#lib/jwt.js";
import { logger } from "#lib/logger.js";
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
const MAX_ROLE_CACHE_SIZE = 10_000;
const roleCache = new Map();

function getRoleCacheKey(userId, documentName) {
    return `${userId}:${documentName}`;
}

function pruneRoleCache() {
    const now = Date.now();
    for (const [cacheKey, entry] of roleCache.entries()) {
        if (!entry || entry.expiresAt <= now) {
            roleCache.delete(cacheKey);
        }
    }

    if (roleCache.size <= MAX_ROLE_CACHE_SIZE) {
        return;
    }

    const overflow = roleCache.size - MAX_ROLE_CACHE_SIZE;
    const oldestEntries = Array.from(roleCache.entries())
        .sort(([, left], [, right]) => left.expiresAt - right.expiresAt)
        .slice(0, overflow);

    oldestEntries.forEach(([cacheKey]) => roleCache.delete(cacheKey));
}

const roleCacheJanitor = setInterval(pruneRoleCache, ROLE_CACHE_TTL_MS);
roleCacheJanitor.unref?.();

async function resolveBlogRole(userId, blogId) {
    try {
        const { data } = await RoleClient.getBlogRole(blogId, userId);
        return data;
    } catch (error) {
        throw mapRoleLookupError(error, "blog", blogId, userId);
    }
}

async function resolveDocsRole(userId, docsId) {
    try {
        const { data } = await RoleClient.getDocsRole(docsId, userId);
        return data;
    } catch (error) {
        throw mapRoleLookupError(error, "docs", docsId, userId);
    }
}

function mapRoleLookupError(error, resourceType, resourceId, userId) {
    const status = error?.response?.status;
    const payload = error?.response?.data;
    const message =
        payload?.message ||
        payload?.error ||
        error?.message ||
        "Forbidden";

    logger.error(
        {
            err: error,
            resourceType,
            resourceId,
            userId,
            status,
            payload,
        },
        "collab role lookup failed",
    );

    if (status === 401) {
        return new AuthError({
            message,
            code: payload?.code || "UNAUTHORIZED",
            httpStatus: 401,
            wsCode: 4401,
            reason: payload?.code || "TOKEN_EXPIRED",
        });
    }

    if (status === 403) {
        return new AuthError({
            message,
            code: payload?.code || "FORBIDDEN",
            httpStatus: 403,
            wsCode: 4403,
            reason: payload?.code || "FORBIDDEN",
        });
    }

    if (status === 404) {
        return new AuthError({
            message,
            code: payload?.code || "NOT_FOUND",
            httpStatus: 404,
            wsCode: 4404,
            reason: payload?.code || "NOT_FOUND",
        });
    }

    if (status === 405) {
        return new AuthError({
            message,
            code: payload?.code || "METHOD_NOT_ALLOWED",
            httpStatus: 405,
            wsCode: 4405,
            reason: payload?.code || "METHOD_NOT_ALLOWED",
        });
    }

    if (typeof status === "number" && status >= 500) {
        return new AuthError({
            message,
            code: payload?.code || "UPSTREAM_ERROR",
            httpStatus: 502,
            wsCode: 4502,
            reason: payload?.code || "UPSTREAM_ERROR",
        });
    }

    return new AuthError({
        message: message || "Role lookup unavailable",
        code: payload?.code || "UPSTREAM_UNAVAILABLE",
        httpStatus: 503,
        wsCode: 4503,
        reason: payload?.code || "UPSTREAM_UNAVAILABLE",
    });
}

async function resolveRoleForDocument(userId, documentName) {
    pruneRoleCache();
    const cacheKey = getRoleCacheKey(userId, documentName);
    const cached = roleCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached;
    }
    if (cached) {
        roleCache.delete(cacheKey);
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

            logger.error(
                { err: error, documentName, userId: user.id },
                "collab onAuthenticate failed unexpectedly",
            );
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

import type { Request } from "express";
import { JWTPayload } from "jose";
import { AuthError, normalizeAuthError } from "../../lib/exceptions/AuthException.js";
import { JwtHelper } from "../../lib/jwt.js";
import { PostRoleClient } from "../../api/postClient/RoleClient.js";

type AuthenticatedUser = {
    id: string;
    payload: JWTPayload;
};

const jwtHelper = new JwtHelper();

export async function authenticateHttpRequest(
    req: Request,
): Promise<AuthenticatedUser> {
    const token = jwtHelper.parseJwtFromRequest(req);
    if (!token) {
        throw new AuthError({
            message: "Missing access token",
            code: "MISSING_TOKEN",
        });
    }

    let payload: JWTPayload;
    try {
        payload = await jwtHelper.verifyAccessToken(token);
    } catch (error: unknown) {
        throw normalizeAuthError(error);
    }

    const userId =
        typeof payload.id === "string"
            ? payload.id
            : typeof payload.sub === "string"
              ? payload.sub
              : null;

    if (!userId) {
        throw new AuthError({
            code: "INVALID_TOKEN",
            message: "Missing user id",
        });
    }

    return { id: userId, payload };
}

export async function requireBlogAccess(
    userId: string,
    blogId: string,
    requireOwner = false,
): Promise<void> {
    const role = await PostRoleClient.create().getBlogRole(blogId, userId);
    if (!role.ok) {
        throw new AuthError({
            message: role.message || "Forbidden",
            code: "FORBIDDEN",
            httpStatus: role.httpStatus || 403,
        });
    }

    if (requireOwner && role.role !== "OWNER") {
        throw new AuthError({
            message: "Only owner can manage blog visibility",
            code: "FORBIDDEN",
            httpStatus: 403,
        });
    }
}

export async function requireDocsAccess(
    userId: string,
    docsId: string,
    requireOwner = false,
): Promise<void> {
    const role = await PostRoleClient.create().getDocsRole(docsId, userId);
    if (!role.ok) {
        throw new AuthError({
            message: role.message || "Forbidden",
            code: "FORBIDDEN",
            httpStatus: role.httpStatus || 403,
        });
    }

    if (requireOwner && role.role !== "OWNER") {
        throw new AuthError({
            message: "Only owner can manage docs visibility",
            code: "FORBIDDEN",
            httpStatus: 403,
        });
    }
}

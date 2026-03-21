import {
    authError,
    AuthReason,
} from "../../types/ws/hocuspocus/AuthenticationErrorTypes.js";

const DEFAULT_AUTH_MESSAGE = "Unauthorized";

export class AuthError extends Error {
    public readonly code: string;
    public readonly httpStatus: number;
    public readonly wsCode: number;
    public readonly reason: AuthReason | string;

    constructor({
        message = DEFAULT_AUTH_MESSAGE,
        code = "UNAUTHORIZED",
        httpStatus = 401,
        wsCode = 4401,
        reason,
    }: authError = {}) {
        super(message);
        this.name = "AuthError";
        this.code = code;
        this.httpStatus = httpStatus;
        this.wsCode = wsCode;
        this.reason = reason || code;
    }
}

export function isAuthError(error: unknown): error is AuthError {
    return error instanceof AuthError;
}

export function normalizeAuthError(error: unknown): AuthError {
    if (isAuthError(error)) {
        return error;
    }

    if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "ERR_JWT_EXPIRED"
    ) {
        return new AuthError({
            message: "Access token expired",
            code: "TOKEN_EXPIRED",
            httpStatus: 401,
            wsCode: 4401,
            reason: "TOKEN_EXPIRED",
        });
    }

    return new AuthError({
        message: "Invalid access token",
        code: "INVALID_TOKEN",
        httpStatus: 401,
        wsCode: 4401,
        reason: "INVALID_TOKEN",
    });
}

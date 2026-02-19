const DEFAULT_AUTH_MESSAGE = "Unauthorized";

export class AuthError extends Error {
    constructor({
        message = DEFAULT_AUTH_MESSAGE,
        code = "UNAUTHORIZED",
        httpStatus = 401,
        wsCode = 4401,
        reason,
    } = {}) {
        super(message);
        this.name = "AuthError";
        this.code = code;
        this.httpStatus = httpStatus;
        this.wsCode = wsCode;
        this.reason = reason || code;
    }
}

export function isAuthError(error) {
    return error instanceof AuthError;
}

export function normalizeAuthError(error) {
    if (isAuthError(error)) {
        return error;
    }

    if (error?.code === "ERR_JWT_EXPIRED") {
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

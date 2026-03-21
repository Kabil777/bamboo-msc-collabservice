import { JWTPayload } from "jose";
import { AuthError } from "../exceptions/AuthException.js";
import { AuthUser } from "../../types/ws/hocuspocus/onAuthenticateTypes.js";

export function buildAuthUser(payload: JWTPayload): AuthUser {
    const id =
        typeof payload.id === "string"
            ? payload.id
            : typeof payload.sub === "string"
              ? payload.sub
              : null;

    if (!id) {
        throw new AuthError({
            message: "Token missing user id",
            code: "INVALID_TOKEN",
            httpStatus: 401,
            wsCode: 4401,
            reason: "INVALID_TOKEN",
        });
    }

    return {
        id,
        email: typeof payload.email === "string" ? payload.email : undefined,
        tokenExpiresAt:
            typeof payload.exp === "number" ? payload.exp * 1000 : undefined,
    };
}

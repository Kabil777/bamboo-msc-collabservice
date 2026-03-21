import { Request } from "express";
import { AuthError } from "../exceptions/AuthException.js";
import { JwtHelper } from "../jwt.js";

export type ValidatedUser = {
    id: string;
};
export async function validateToken(
    jwtHelper: JwtHelper,
    req: Request,
): Promise<ValidatedUser> {
    const token = jwtHelper.parseJwtFromRequest(req);

    if (!token) {
        throw new AuthError({
            message: "token not found",
            httpStatus: 401,
            reason: "INVALID_TOKEN",
        });
    }

    const currentUser = await jwtHelper.verifyAccessToken(token);
    if (typeof currentUser.id !== "string") {
        throw new AuthError({
            message: "token not found",
            httpStatus: 401,
            reason: "INVALID_TOKEN",
        });
    }
    return { id: currentUser.id };
}

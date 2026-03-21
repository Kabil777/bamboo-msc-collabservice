import { PostRoleClient } from "../../api/postClient/RoleClient.js";
import { AuthError } from "../exceptions/AuthException.js";

export async function parseRequestUser(
    roleClient: PostRoleClient,
    blogId: string,
    currentUser: { id: string },
) {
    try {
        const requestedUser = await roleClient.getBlogRole(
            blogId,
            currentUser.id,
        );

        if (!requestedUser.ok) {
            throw new AuthError({
                message: requestedUser.message || "Forbidden",
                httpStatus: requestedUser.httpStatus || 403,
                reason: "FORBIDDEN",
            });
        }

        if (requestedUser.role !== "OWNER") {
            throw new AuthError({
                message: "Only owner of document can save",
                httpStatus: 403,
                reason: "FORBIDDEN",
            });
        }

        return requestedUser;
    } catch (error) {
        if (error instanceof AuthError) {
            throw error;
        }

        throw new AuthError({
            message: "Role lookup failed",
            httpStatus: 403,
            reason: "FORBIDDEN",
        });
    }
}

import { parse } from "cookie";

export function getAccessTokenFromRequest(req) {
    const authHeader = req.headers?.authorization || req.headers?.Authorization || "";
    if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
        return authHeader.slice(7).trim() || null;
    }

    const cookieHeader = req.headers?.cookie || "";
    const cookies = parse(cookieHeader);
    return cookies.ac_token || null;
}

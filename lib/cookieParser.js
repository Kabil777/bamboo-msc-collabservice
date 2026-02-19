import { parse } from "cookie";

export function getAccessTokenFromRequest(req) {
    const cookieHeader = req.headers?.cookie || "";
    const cookies = parse(cookieHeader);
    return cookies.ac_token || null;
}

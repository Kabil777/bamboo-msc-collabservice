export type AuthReason =
    | "UNAUTHORIZED"
    | "TOKEN_EXPIRED"
    | "INVALID_TOKEN"
    | "MISSING_TOKEN"
    | "FORBIDDEN"
    | "NOT_FOUND";

export type BuildErrorInput = {
    message?: string;
    code?: string;
    httpStatus?: number;
    wsCode?: number;
    reason?: "NOT_FOUND" | "FORBIDDEN" | "INVALID_TOKEN" | "UNAUTHORIZED";
};

export type authError = {
    message?: string;
    code?: string;
    httpStatus?: number;
    wsCode?: number;
    reason?: AuthReason;
};

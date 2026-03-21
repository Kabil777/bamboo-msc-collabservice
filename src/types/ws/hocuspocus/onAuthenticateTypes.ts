import { IncomingMessage } from "node:http";

type RoleInfo = {
    readonly: boolean;
    role: string;
};

export type AuthUser = {
    id: string;
    tokenExpiresAt?: number;
    email?: string;
};

type AuthContext = {
    user: AuthUser;
    role: string;
    tokenExpiresAt?: number;
};

type ConnectionConfig = {
    readOnly?: boolean;
    user?: AuthUser;
    context?: AuthContext;
    [key: string]: unknown;
};

export type OnAuthenticationArgs = {
    request: IncomingMessage;
    documentName: string;
    connectionConfig: ConnectionConfig;
};

export type OnAuthenticateResult = {
    user: AuthUser;
    role: string;
    tokenExpiresAt?: number;
};

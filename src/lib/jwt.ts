import { parse as parseCookie } from "cookie";
import { createRemoteJWKSet, JWTPayload, jwtVerify } from "jose";
import { IncomingMessage } from "node:http";

export class JwtHelper {
    private readonly jwtUri: string;
    private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

    constructor() {
        this.jwtUri =
            process.env.JWK_SET_URI ?? "http://127.0.0.1:8080/oauth2/jwks";
        this.jwks = createRemoteJWKSet(new URL(this.jwtUri));
    }

    public async verifyAccessToken(token: string): Promise<JWTPayload> {
        const { payload } = await jwtVerify(token, this.jwks, {
            algorithms: ["RS256"],
            clockTolerance: "5s",
        });
        return payload;
    }

    public parseJwtFromRequest(request: IncomingMessage): string | null {
        const header = request.headers.authorization;

        if (typeof header === "string" && header.startsWith("Bearer ")) {
            const token = header.slice(7).trim();
            if (token) return token;
        }

        const cookieHeader = request.headers.cookie;
        if (!cookieHeader) return null;

        return parseCookie(cookieHeader).ac_token ?? null;
    }
}

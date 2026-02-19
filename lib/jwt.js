import { createRemoteJWKSet, jwtVerify } from "jose";

const jwkSetUri =
    process.env.JWK_SET_URI || "http://127.0.0.1:8080/oauth2/jwks";
const jwks = createRemoteJWKSet(new URL(jwkSetUri));

export async function verifyAccessToken(token) {
    const { payload } = await jwtVerify(token, jwks, {
        algorithms: ["RS256"],
        clockTolerance: "5s",
    });

    return {
        id: payload.id,
        email: payload.email,
        name: payload.sub,
        tokenExpiresAt:
            typeof payload.exp === "number" ? payload.exp * 1000 : null,
    };
}

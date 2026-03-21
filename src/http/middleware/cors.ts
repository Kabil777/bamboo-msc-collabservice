export function createCorsMiddleware(
    allowedOrigins = new Set([
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]),
) {
    return (req, res, next) => {
        const origin = req.headers.origin;
        if (origin && allowedOrigins.has(origin)) {
            res.setHeader("Access-Control-Allow-Origin", origin);
            res.setHeader("Access-Control-Allow-Credentials", "true");
            res.setHeader(
                "Access-Control-Allow-Headers",
                "Content-Type, Authorization",
            );
            res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
            res.setHeader("Vary", "Origin");
        }

        if (req.method === "OPTIONS") {
            res.status(204).end();
            return;
        }

        next();
    };
}

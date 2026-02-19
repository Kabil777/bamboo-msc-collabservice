import express from "express";
import { createServer } from "node:http";
import { getAccessTokenFromRequest } from "#lib/cookieParser.js";
import { AuthError, isAuthError, normalizeAuthError } from "#lib/authError.js";
import { verifyAccessToken } from "#lib/jwt.js";
import { COLLAB_PATH, PORT, isCollabPath } from "./config.js";
import { saveBlog } from "#services/persistence/saveBlogContent.js";
import { flushStore } from "../../lib/documentPersistenceScheduler.js";

function statusText(status) {
    if (status === 401) return "Unauthorized";
    if (status === 403) return "Forbidden";
    if (status === 400) return "Bad Request";
    return "Error";
}

function respondToUpgradeFailure(socket, status, bodyObj) {
    const body = JSON.stringify(bodyObj);
    const headers = [
        `HTTP/1.1 ${status} ${statusText(status)}`,
        "Connection: close",
        "Content-Type: application/json; charset=utf-8",
        `Content-Length: ${Buffer.byteLength(body)}`,
    ];

    socket.write(`${headers.join("\r\n")}\r\n\r\n${body}`);
    socket.destroy();
}

async function authenticateHttpRequest(req) {
    const token = getAccessTokenFromRequest(req);
    if (!token) {
        throw new AuthError({
            message: "Missing access token",
            code: "MISSING_TOKEN",
            httpStatus: 401,
            wsCode: 4401,
            reason: "MISSING_TOKEN",
        });
    }

    try {
        return await verifyAccessToken(token);
    } catch (error) {
        throw normalizeAuthError(error);
    }
}

export function createHttpServer(collabServer) {
    const app = express();
    const httpServer = createServer(app);
    const allowedOrigins = new Set([
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]);

    app.use((req, res, next) => {
        const origin = req.headers.origin;
        if (origin && allowedOrigins.has(origin)) {
            res.setHeader("Access-Control-Allow-Origin", origin);
            res.setHeader("Access-Control-Allow-Credentials", "true");
            res.setHeader(
                "Access-Control-Allow-Headers",
                "Content-Type, Authorization",
            );
            res.setHeader(
                "Access-Control-Allow-Methods",
                "GET,POST,OPTIONS",
            );
            res.setHeader("Vary", "Origin");
        }

        if (req.method === "OPTIONS") {
            res.status(204).end();
            return;
        }

        next();
    });

    app.get("/health", (_req, res) => {
        res.status(200).json({ ok: true, service: "collab-msc" });
    });

    app.post("/api/blog/save/:id", async (req, res) => {
        const { id } = req.params;
        const documentName = `blog:${id}`;

        try {
            await authenticateHttpRequest(req);

            const liveDocument =
                collabServer?.hocuspocus?.documents?.get(documentName);

            if (liveDocument) {
                await flushStore(documentName, liveDocument, true);
                return res
                    .status(200)
                    .json({ ok: true, source: "live-doc", blogId: id });
            }

            const result = await saveBlog(id);

            if (!result.ok && result.reason === "not_found") {
                return res
                    .status(404)
                    .json({ ok: false, error: "blog_not_found", blogId: id });
            }

            if (!result.ok) {
                return res
                    .status(500)
                    .json({ ok: false, error: "save_failed", blogId: id });
            }

            return res.status(200).json({ ok: true, source: "db", blogId: id });
        } catch (error) {
            if (isAuthError(error)) {
                return res.status(error.httpStatus || 401).json({
                    ok: false,
                    code: error.code || "UNAUTHORIZED",
                    message: error.message || "Unauthorized",
                });
            }

            return res
                .status(500)
                .json({ ok: false, error: "save_failed", blogId: id });
        }
    });
    app.all([COLLAB_PATH, "/"], async (req, res) => {
        await collabServer.requestHandler(req, res);
    });

    httpServer.on("upgrade", async (request, socket, head) => {
        if (!isCollabPath(request.url)) {
            socket.destroy();
            return;
        }

        try {
            await collabServer.hocuspocus.hooks("onUpgrade", {
                request,
                socket,
                head,
                instance: collabServer.hocuspocus,
            });

            collabServer.webSocketServer.handleUpgrade(
                request,
                socket,
                head,
                (ws) => {
                    collabServer.webSocketServer.emit(
                        "connection",
                        ws,
                        request,
                    );
                },
            );
        } catch (_error) {
            if (isAuthError(_error)) {
                respondToUpgradeFailure(socket, _error.httpStatus || 401, {
                    ok: false,
                    code: _error.code || "UNAUTHORIZED",
                    message: _error.message || "Unauthorized",
                });
                return;
            }

            socket.destroy();
        }
    });

    return httpServer;
}

export function listenHttpServer(httpServer) {
    httpServer.listen(PORT, () => {
        console.log(
            `[collab] Express+Hocuspocus listening on http://0.0.0.0:${PORT}/`,
        );
    });
}

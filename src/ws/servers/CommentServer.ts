import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import WebSocket, { RawData, WebSocketServer } from "ws";
import { JwtHelper } from "../../lib/jwt.js";
import { logger } from "../../lib/logger.js";
import { WsCommentHandler } from "../handler/WsCommentHandler.js";

export class CommentServer {
    private readonly commentServer: WebSocketServer;
    private readonly jwtHelper: JwtHelper;
    private rooms: Map<string, Set<WebSocket>>;

    constructor() {
        this.jwtHelper = new JwtHelper();
        this.rooms = new Map<string, Set<WebSocket>>();
        this.commentServer = new WebSocketServer({ noServer: true });

        this.commentServer.on(
            "connection",
            (websocket: WebSocket, request: IncomingMessage) => {
                const incomingRequest = request as IncomingMessage & {
                    user?: { id: string; name: string };
                };

                const user = incomingRequest.user;
                if (!user) {
                    logger.warn({ url: request.url }, "comment ws unauthorized connection");
                    websocket.close(1008, "Unauthorized");
                    return;
                }
                const room = this.getRoom(request);
                if (room == null) {
                    logger.warn({ url: request.url }, "comment ws missing room");
                    websocket.close(4404, "ROOM NOT FOUND");
                    return;
                }
                this.joinRoom(room, websocket);
                websocket.on("message", (message: RawData) => {
                    void WsCommentHandler.handleMessage(
                        message,
                        this.rooms,
                        room,
                        websocket,
                        user.id,
                        user.name,
                    );
                });
                websocket.on("close", () => {
                    this.leaveRoom(room, websocket);
                });
            },
        );
    }

    public async handleUpgrade(
        request: IncomingMessage,
        socket: Socket,
        head: Buffer,
    ): Promise<void> {
        try {
            const token = this.jwtHelper.parseJwtFromRequest(request);
            if (!token) {
                logger.warn({ url: request.url }, "comment ws missing token");
                socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
                socket.destroy();
                return;
            }
            const userDetails = await this.jwtHelper.verifyAccessToken(token);
            (
                request as IncomingMessage & {
                    user?: { id: string; name: string };
                }
            ).user = {
                id: userDetails.id as string,
                name: userDetails.name as string,
            };
            this.commentServer.handleUpgrade(
                request,
                socket,
                head,
                (ws, req) => {
                    logger.info(
                        { url: request.url, userId: userDetails.id },
                        "comment ws upgrade accepted",
                    );
                    this.commentServer.emit("connection", ws, req);
                },
            );
        } catch (error) {
            logger.error({ err: error, url: request.url }, "comment ws upgrade failed");
            socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
            socket.destroy();
        }
    }

    public joinRoom(room: string, websocket: WebSocket): void {
        if (!this.rooms.get(room)) {
            this.rooms.set(room, new Set());
        }
        this.rooms.get(room)!.add(websocket);
    }

    public leaveRoom(room: string, websocket: WebSocket): void {
        const members = this.rooms.get(room);
        if (!members) {
            return;
        }

        members.delete(websocket);
        if (members.size === 0) {
            this.rooms.delete(room);
        }
    }

    public getRoom(request: IncomingMessage): string | null {
        const url = new URL(request.url ?? "", "http://localhost");
        const room = url.searchParams.get("room");
        return room;
    }
}

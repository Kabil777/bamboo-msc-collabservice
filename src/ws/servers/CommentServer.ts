import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import WebSocket, { RawData, WebSocketServer } from "ws";
import { JwtHelper } from "../../lib/jwt.js";
import { request } from "express";
import { AuthError } from "../../lib/exceptions/AuthException.js";
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
                    websocket.close(1008, "Unauthorized");
                    return;
                }
                const room = this.getRoom(request, websocket);
                if (room == null) {
                    websocket.close(4404, "ROOM NOT FOUND");
                    return;
                }
                this.joinRoom(room, websocket);
                websocket.on("message", (message: RawData) => {
                    WsCommentHandler.handleMessage(
                        message,
                        room,
                        websocket,
                        user.name,
                    );
                });
                //remaining code
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
                    this.commentServer.emit("connection", ws, req);
                },
            );
        } catch (error) {
            socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
            socket.destroy();
        }
    }

    public joinRoom(room: string, websocket: WebSocket): void {
        if (this.rooms.get(room)) {
            this.rooms.set(room, new Set());
        }
        this.rooms.get(room)!.add(websocket);
    }

    public getRoom(
        request: IncomingMessage,
        websocket: WebSocket,
    ): string | null {
        const url = new URL(request.url ?? "", process.env.API_URL);
        const room = url.searchParams.get("room");
        return room;
    }
}

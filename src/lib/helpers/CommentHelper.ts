import WebSocket from "ws";
import { CommentEvent } from "../../ws/handler/WsCommentHandler.js";

export class CommentHelper {
    private constructor() {}

    public BroadcastFn(
        status: "TYPING" | "COMMENT_PUBLISHED" | "COMMENT_DELETED",
        rooms: Map<string, Set<WebSocket>>,
        room: string,
        payload: string,
        sender?: WebSocket,
    ) {
        const members = rooms.get(room);
        if (members == null) return;

        for (const client of members) {
            if (client === sender) continue;
            if (client.readyState !== WebSocket.OPEN) continue;
            client.send(payload);
        }
    }

    public PublishFn(event: CommentEvent) {
        if (event.type === "COMMENT_PUBLISHED") {
            //rabbit helper
        }
    }
}

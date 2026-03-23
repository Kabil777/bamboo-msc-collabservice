import { RabbitManager } from "../../lib/rabbit.js";
import WebSocket from "ws";
import { CommentEvent } from "./WsCommentHandler.js";

export class ServiceHandlers {
    private constructor() {}

    public static BroadcastFn(
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

    public static async PublishFn(event: CommentEvent) {
        if (event.type === "COMMENT_PUBLISHED") {
            await RabbitManager.publish(
                "comment.events",
                "comment.event.published",
                JSON.stringify(event),
            );
        }

        if (event.type === "COMMENT_DELETED") {
            await RabbitManager.publish(
                "comment.events",
                "comment.event.deleted",
                JSON.stringify(event),
            );
        }
    }
}

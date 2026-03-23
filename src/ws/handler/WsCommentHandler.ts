import WebSocket, { RawData } from "ws";
import { ServiceHandlers } from "./CommentServiceHandler.js";

export type TypingMessage = {
    status: "TYPING";
    timestamp: string;
};

export type PublishedMessage = {
    status: "PUBLISHED";
    content: string;
    timestamp: string;
    isReply: boolean;
    replyId: string | null;
};

export type DeleteMessage = {
    status: "DELETE";
    id: string;
    timestamp: string;
    isReply: boolean;
    replyId: string | null;
};

export type MessageFormat = TypingMessage | PublishedMessage | DeleteMessage;

export type CommentEvent =
    | {
          type: "COMMENT_PUBLISHED";
          room: string;
          userId: string;
          content: string;
          timestamp: string;
          isReply: boolean;
          replyId: string | null;
      }
    | {
          type: "COMMENT_DELETED";
          room: string;
          commentId: string;
          userId: string;
          timestamp: string;
          isReply: boolean;
          replyId: string | null;
      };

export class WsCommentHandler {
    private constructor() {}

    public static handleMessage = async (
        message: RawData,
        rooms: Map<string, Set<WebSocket>>,
        room: string,
        websocket: WebSocket,
        userId: string,
        userName: string,
    ): Promise<void> => {
        const incomingMessage: MessageFormat = JSON.parse(message.toString());

        if (incomingMessage.status === "TYPING") {
            ServiceHandlers.BroadcastFn(
                rooms,
                room,
                JSON.stringify({
                    status: "TYPING",
                    userId,
                    userName,
                    timestamp: new Date().toISOString(),
                }),
                websocket,
            );
            return;
        }

        if (incomingMessage.status === "PUBLISHED") {
            const event: CommentEvent = {
                type: "COMMENT_PUBLISHED",
                room,
                userId,
                content: incomingMessage.content,
                timestamp: new Date().toISOString(),
                isReply: incomingMessage.isReply,
                replyId: incomingMessage.replyId,
            };

            ServiceHandlers.BroadcastFn(
                rooms,
                room,
                JSON.stringify({ ...event, userName }),
                websocket,
            );
            await ServiceHandlers.PublishFn(event);
            return;
        }

        const event: CommentEvent = {
            type: "COMMENT_DELETED",
            room,
            userId,
            isReply: incomingMessage.isReply,
            commentId: incomingMessage.id,
            timestamp: new Date().toISOString(),
            replyId: incomingMessage.replyId,
        };

        ServiceHandlers.BroadcastFn(
            rooms,
            room,
            JSON.stringify({ ...event, userName }),
            websocket,
        );
        await ServiceHandlers.PublishFn(event);
    };
}

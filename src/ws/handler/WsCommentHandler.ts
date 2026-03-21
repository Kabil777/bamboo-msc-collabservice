import WebSocket, { RawData } from "ws";

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
          user: string;
          content: string;
          timestamp: string;
          isReply: boolean;
          replyId: string | null;
      }
    | {
          type: "COMMENT_DELETED";
          room: string;
          commentId: string;
          user: string;
          timestamp: string;
          isReply: boolean;
          replyId: string | null;
      };

type BroadcastFn = (
    status: "TYPING" | "COMMENT_PUBLISHED" | "COMMENT_DELETED",
    room: string,
    payload: string,
    sender?: WebSocket,
) => void;
type PublishFn = (event: CommentEvent) => Promise<void>;

export class WsCommentHandler {
    private constructor() {}

    public static handleMessage = async (
        message: RawData,
        room: string,
        websocket: WebSocket,
        user: string,
        broadcastFn: BroadcastFn,
        publishFn: PublishFn,
    ): Promise<void> => {
        const incomingMessage: MessageFormat = JSON.parse(message.toString());

        if (incomingMessage.status === "TYPING") {
            broadcastFn(
                "TYPING",
                room,
                JSON.stringify({
                    status: "TYPING",
                    user,
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
                user,
                content: incomingMessage.content,
                timestamp: new Date().toISOString(),
                isReply: incomingMessage.isReply,
                replyId: incomingMessage.replyId,
            };

            broadcastFn(
                "COMMENT_PUBLISHED",
                room,
                JSON.stringify(event),
                websocket,
            );
            await publishFn(event);
            return;
        }

        const event: CommentEvent = {
            type: "COMMENT_DELETED",
            room,
            user,
            isReply: incomingMessage.isReply,
            commentId: incomingMessage.id,
            timestamp: new Date().toISOString(),
            replyId: incomingMessage.replyId,
        };

        broadcastFn("COMMENT_DELETED", room, JSON.stringify(event), websocket);
        await publishFn(event);
    };
}

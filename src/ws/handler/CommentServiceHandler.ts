import { ChannelModel } from "amqplib";
import { RabbitManager } from "../../lib/rabbit.js";
import WebSocket from "ws";

type BroadcastFn = (room: string, payload: string, sender?: WebSocket) => void;
export class ServiceHandlers {
    private rabbitClient: ChannelModel | null = null;

    private constructor() {}

    private static async create(): Promise<ServiceHandlers> {
        const instance = new ServiceHandlers();
        instance.rabbitClient = await RabbitManager.getClient();
        return instance;
    }

    public async BroadCastFn(
        status: "TYPING" | "COMMENT_PUBLISHED" | "COMMENT_DELETED",
        room: string,
        payload: string,
        sender: WebSocket,
    ) {
        const client = await ServiceHandlers.create();
    }
}

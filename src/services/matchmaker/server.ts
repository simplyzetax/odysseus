import { DurableObject } from "cloudflare:workers";
import { jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { logger } from "hono/logger";
import { MatchmakingPayload, matchmakingPayloadSchema } from "./schemas/payload";
import { WSCC } from "./wscc";
import { getDB, getDBEnv } from "@core/db/client";
import { ACCOUNTS } from "@core/db/schemas/account";
enum MatchmakingState {
    None = 0,
    Connecting = 1,
    Waiting = 2,
    Queued = 3,
    SessionAssignment = 4,
    Joining = 5,
}

interface WebSocketWithData extends WebSocket {
    payload: MatchmakingPayload;
    state: MatchmakingState;
}

export class MatchmakerServer extends DurableObject {
    private ids: Record<string, string> = {};
    public matchOpen = false;
    protected env: Env;

    constructor(state: DurableObjectState, env: Env) {
        super(state, env);
        this.env = env;
    }

    /**
     * Sets a property on the MatchmakerServer instance.
     * @param key - The key of the property to set.
     * @param value - The value to set the property to.
     */
    async setProperty<K extends keyof this>(
        key: K,
        value: this[K]
    ): Promise<void> {
        console.debug(`[Matchmaker] Setting property ${key.toString()} to ${value}`);
        this[key] = value;
    }

    async fetch(request: Request): Promise<Response> {
        const webSocketPair = new WebSocketPair();
        const [client, server] = Object.values(webSocketPair);

        this.ctx.acceptWebSocket(server);
        server.serializeAttachment(JSON.stringify({ "Sec-Websocket-ID": request.headers.get("Sec-Websocket-ID") }));
        this.ctx.waitUntil(this.handleConnection(request));

        return new Response(null, {
            status: 101,
            webSocket: client,
        });
    }

    async handleConnection(req: Request) {
        console.debug('Handling connection');

        const clients = this.ctx.getWebSockets();
        const client = clients.find((socket) => {
            const data = socket.deserializeAttachment();
            const reqID = req.headers.get("Sec-Websocket-ID");
            return typeof data === 'string' && data === JSON.stringify({ "Sec-Websocket-ID": reqID });
        });

        if (!client) {
            console.warn('Client not found');
            return;
        }

        const Authorization = req.headers.get("Authorization");
        if (!Authorization) {
            return client.close(WSCC.PolicyViolation, "Missing Authorization header");
        }

        const [parsedPayload, signature] = await this.getAndVerifyPayload(req);
        if (!parsedPayload || !signature) {
            return client.close(WSCC.PolicyViolation, 'Invalid payload');
        }

        const validAccount = await this.verifyAccount(req, parsedPayload);
        if (!validAccount) {
            return client.close(WSCC.PolicyViolation, 'Invalid account');
        }

        const currentTime = Date.now();
        const expireTime = new Date(parsedPayload.expireAt).getTime();

        if (currentTime > expireTime || currentTime - expireTime > 15000) {
            console.debug("Matchmaking payload is expired, closing client");
            return client.close(WSCC.PolicyViolation, 'Token expired or too old');
        }

        this.setClientData(client, parsedPayload, MatchmakingState.None);
        await this.progressClientQueueState(client);
    }

    private async getAndVerifyPayload(request: Request): Promise<[MatchmakingPayload | undefined, string | undefined]> {
        try {
            const auth = request.headers.get('Authorization');
            if (!auth) return [undefined, undefined];

            const [, , unsafeEncodedPayload, signature] = auth.split(' ');
            if (!unsafeEncodedPayload || !signature) {
                console.debug('Invalid payload found while splitting');
                return [undefined, undefined];
            }

            const decodedPayload = await jwtVerify(
                unsafeEncodedPayload,
                new TextEncoder().encode(DMNO_CONFIG.JWT_SECRET),
                { algorithms: ['HS256'] }
            );

            if (!decodedPayload) {
                console.debug('Invalid payload found while decoding');
                return [undefined, undefined];
            }

            const parsedPayload = matchmakingPayloadSchema.safeParse(decodedPayload.payload);
            if (!parsedPayload.success) {
                console.debug("Parsing failed", parsedPayload.error);
                return [undefined, undefined];
            }

            return [parsedPayload.data, signature];
        } catch (error) {
            console.error('Error in getPayload:', error);
            return [undefined, undefined];
        }
    }

    private async verifyAccount(req: Request, payload: MatchmakingPayload): Promise<boolean> {
        const [account] = await getDBEnv(req, this.env)
            .select()
            .from(ACCOUNTS)
            .where(eq(ACCOUNTS.id, payload.playerId));
        return !!account;
    }

    private getConnectedClients(): WebSocketWithData[] {
        return this.ctx.getWebSockets()
            .map(ws => {
                const data = this.getClientData(ws);
                if (!data) return null;

                (ws as WebSocketWithData).payload = data.mm;
                (ws as WebSocketWithData).state = data.state;
                return ws as WebSocketWithData;
            })
            .filter((client): client is WebSocketWithData =>
                client !== null && client.readyState === WebSocket.OPEN
            );
    }

    private async getId(key: 'matchId' | 'sessionId' | 'ticketId'): Promise<string> {
        if (this.ids[key]) return this.ids[key];

        const storedId = await this.ctx.storage.get(key);
        let id: string;

        if (typeof storedId === 'string') {
            id = storedId;
        } else {
            id = crypto.randomUUID();
            await this.ctx.storage.put(key, id);
        }

        this.ids[key] = id;
        return id;
    }

    private setClientData(ws: WebSocket, payload: MatchmakingPayload, state: MatchmakingState): void {
        ws.serializeAttachment(JSON.stringify({ mm: payload, state }));
    }

    private getClientData(ws: WebSocket): { mm: MatchmakingPayload, state: MatchmakingState } | undefined {
        try {
            const rawData = ws.deserializeAttachment();
            if (typeof rawData !== 'string') {
                ws.close(WSCC.PolicyViolation, 'Invalid serialization data');
                return undefined;
            }

            const data = JSON.parse(rawData);
            const parsedData = matchmakingPayloadSchema.safeParse(data.mm);

            if (!parsedData.success) {
                console.debug("Parsing failed", parsedData.error);
                ws.close(WSCC.PolicyViolation, 'Invalid serialization data');
                return undefined;
            }

            return { mm: parsedData.data, state: data.state };
        } catch (error) {
            ws.close(WSCC.PolicyViolation, 'Invalid serialization data');
            return undefined;
        }
    }

    private sendMessage(ws: WebSocket, name: string, payload: Record<string, any>): void {
        ws.send(JSON.stringify({ name, payload }));
    }

    private async sendStateMessage(ws: WebSocketWithData, state: MatchmakingState): Promise<void> {
        const clients = this.getConnectedClients();

        switch (state) {
            case MatchmakingState.Connecting:
                this.sendMessage(ws, 'StatusUpdate', { state: 'Connecting' });
                break;

            case MatchmakingState.Waiting:
                this.sendMessage(ws, 'StatusUpdate', {
                    totalPlayers: clients.length,
                    connectedPlayers: clients.length,
                    state: 'Waiting',
                });
                break;

            case MatchmakingState.Queued:
                this.sendMessage(ws, 'StatusUpdate', {
                    ticketId: await this.getId('ticketId'),
                    queuedPlayers: clients.length,
                    estimatedWaitSec: 10,
                    status: {},
                    state: 'Queued',
                });
                break;

            case MatchmakingState.SessionAssignment:
                this.sendMessage(ws, 'StatusUpdate', {
                    matchId: await this.getId('matchId'),
                    state: "SessionAssignment"
                });
                break;

            case MatchmakingState.Joining:
                this.sendMessage(ws, 'Play', {
                    matchId: await this.getId('matchId'),
                    sessionId: await this.getId('sessionId'),
                    joinDelaySec: 1
                });
                break;
        }
    }

    public async progressClientQueueState(ws?: WebSocket): Promise<{ success: boolean, error?: Error }> {
        if (ws) {
            try {
                await this.progressSingleClientState(ws);
                return { success: true };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
            }
        } else {
            const clients = this.getConnectedClients();
            if (clients.length === 0) {
                console.warn('No clients connected, cannot progress state');
                return { success: false, error: new Error('No clients connected') };
            }

            try {
                await Promise.all(clients.map(client => this.progressSingleClientState(client)));
                return { success: true };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
            }
        }
    }

    private async progressSingleClientState(ws: WebSocket): Promise<void> {
        const data = this.getClientData(ws);
        if (!data) {
            throw new Error('Invalid client data');
        }

        if (this.matchOpen) {
            // Fast-track to completion if match already open
            const wsWithData = ws as WebSocketWithData;
            for (const state of [
                MatchmakingState.Connecting,
                MatchmakingState.Waiting,
                MatchmakingState.Queued,
                MatchmakingState.SessionAssignment,
                MatchmakingState.Joining
            ]) {
                await this.sendStateMessage(wsWithData, state);
            }
            return;
        }

        // Normal progression
        const currentState = data.state;
        const nextState = currentState + 1;

        if (nextState > MatchmakingState.Joining) {
            return; // Already at max state
        }

        console.info(`Progressing state from ${currentState} to ${nextState}`);
        this.setClientData(ws, data.mm, nextState);

        const wsWithData = ws as WebSocketWithData;
        await this.sendStateMessage(wsWithData, nextState);

        // Auto-progress through initial states
        if (nextState < MatchmakingState.Queued) {
            await this.progressSingleClientState(ws);
        }
    }

    async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
        console.debug('WebSocket closed:', { code, reason, wasClean });
        ws.close(code, reason);

        const clients = this.getConnectedClients();
        if (clients.length > 0) {
            // Update queued status for remaining clients
            for (const client of clients.filter(c => c.state === MatchmakingState.Queued)) {
                await this.sendStateMessage(client, MatchmakingState.Queued);
            }
        }
    }

    async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
        ws.close(WSCC.PolicyViolation, 'No messages allowed');
    }
}
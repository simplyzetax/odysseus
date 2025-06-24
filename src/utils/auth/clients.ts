export const CLIENTS = {
    fn: {
        secret: "fn_secret",
    },
    odysseus: {
        secret: "odysseus_secret",
    },
} as const;

export type ClientId = keyof typeof CLIENTS;
export type ClientSecret = typeof CLIENTS[ClientId]["secret"];
export type Client = typeof CLIENTS[ClientId];
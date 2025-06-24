import { z } from "zod";

export const matchmakingPayloadSchema = z.object({
    playerId: z.string(),
    partyPlayerIds: z.array(z.string().or(z.number())), // Assuming partyMembers is an array of strings
    bucketId: z.string(),
    attributes: z.object({
        "player.subregions": z.string(),
        "player.season": z.string().or(z.number()), // Assuming season is a string or a number
        "player.option.partyId": z.string(), // Assuming partyId is a string
        "player.userAgent": z.string(),
        "player.platform": z.string(),
        "player.option.linkType": z.string(),
        "player.preferredSubregion": z.string(),
        "player.input": z.string(),
        "playlist.revision": z.number(),
        customKey: z.string().optional(),
        "player.option.fillTeam": z.boolean(),
        "player.option.linkCode": z.string(),
        "player.option.uiLanguage": z.string(),
        "player.privateMMS": z.boolean(),
        "player.option.spectator": z.boolean(),
        "player.inputTypes": z.string(),
        "player.option.groupBy": z.string(),
        "player.option.microphoneEnabled": z.boolean(),
    }),
    expireAt: z.string(),
    nonce: z.string(),
});

export type MatchmakingPayload = z.infer<typeof matchmakingPayloadSchema>;
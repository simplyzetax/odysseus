import { app } from "@core/app";
import { odysseus } from "@core/error";
import { acidMiddleware } from "@middleware/auth/acid";
import { MatchmakingPayload } from "@services/matchmaker/schemas/payload";
import { MatchmakerServer } from "@services/matchmaker/server";
import { sha256 } from "hono/utils/crypto";
import { SignJWT } from "jose";

//TODO: Implement the rest of the matchmaking API endpoints

app.get("/fortnite/api/matchmaking/session/findPlayer/:accountId", (c) => {
    return c.sendStatus(200);
});

app.get("/fortnite/api/game/v2/matchmaking/account/:accountId/session/:sessionId", (c) => {
    return c.json({
        accountId: c.req.param("accountId"),
        sessionId: c.req.param("sessionId"),
        key: "none"
    });
});

app.post("/fortnite/api/matchmaking/session/:sessionId/join", acidMiddleware, (c) => {
    //TODO: Check if sessionId is valid and if server is ready to be joined
    const sessionId = c.req.param("sessionId");
    return c.sendStatus(204);
});

app.post("/fortnite/api/matchmaking/session/matchMakingRequest", (c) => {
    return c.json([])
});

app.get("/fortnite/api/game/v2/matchmakingservice/ticket/player/:accountId", acidMiddleware, async (c) => {
    // Validate bucket ID
    const bucketId = c.req.query("bucketId");
    if (!bucketId) {
        return c.sendError(odysseus.basic.badRequest.withMessage("bucketId is required"));
    }

    // Helper function to validate bucket ID
    const validateBucketId = (bucketId: string | undefined): { valid: boolean; parts?: string[] } => {
        if (!bucketId || bucketId.split(":").length !== 4) {
            return { valid: false };
        }
        return { valid: true, parts: bucketId.split(":") };
    };

    const bucketValidation = validateBucketId(bucketId);

    if (!bucketValidation.valid) {
        return c.sendError(odysseus.matchmaking.invalidBucketId);
    }

    const [buildUniqueIdPart, , region] = bucketValidation.parts!;

    // Store unique build ID for later reference
    c.executionCtx.waitUntil(c.env.kv.put(`uniqueBuildId:${buildUniqueIdPart}`, c.var.accountId, {
        expirationTtl: 60 * 30
    }));

    const playerCustomKey = c.req.query("player.option.customKey") || "none";

    const unixTime = Date.now().toString();
    const signatureHash = await sha256(`${c.var.accountId}:${bucketId}:${unixTime}`);
    if (!signatureHash) {
        return c.sendError(odysseus.internal.serverError.withMessage("Failed to generate signature hash"));
    }

    const payload: MatchmakingPayload = {
        playerId: c.var.accountId,
        partyPlayerIds: [], //TODO: Replace with partyMembers variable
        bucketId: bucketId,
        attributes: {
            "player.subregions": region,
            "player.season": c.misc.buildInfo.season,
            "player.option.partyId": "partyId", //TODO: Replace with partyId variable
            "player.userAgent": c.misc.buildInfo.cl,
            "player.platform": "Windows",
            "player.option.linkType": "DEFAULT",
            "player.preferredSubregion": region,
            "player.input": "KBM",
            "playlist.revision": 1,
            ...(playerCustomKey && { 'customKey': playerCustomKey }),
            "player.option.fillTeam": false,
            "player.option.linkCode": playerCustomKey ? playerCustomKey : "none",
            "player.option.uiLanguage": "en",
            "player.privateMMS": playerCustomKey ? true : false,
            "player.option.spectator": false,
            "player.inputTypes": "KBM",
            "player.option.groupBy": playerCustomKey ? playerCustomKey : "none",
            "player.option.microphoneEnabled": true,
        },
        expireAt: new Date(Date.now() + 1000 * 30).toISOString(),
        nonce: signatureHash,
    };

    const signedPayload = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .sign(new TextEncoder().encode(DMNO_CONFIG.JWT_SECRET));

    const url = new URL(c.req.url)

    const protocol = url.protocol === "https:" ? "wss" : "ws";

    console.info(`[Matchmaking] ${c.var.accountId} requested a ticket for ${bucketId}`);
    console.info(`[Matchmaking] WS URL: ${protocol}://${url.host}/fortnite/api/game/v1/matchmakingservice/ws?playerCustomKey=${playerCustomKey}`);

    return c.json({
        serviceUrl: `${protocol}://${url.host}/fortnite/api/game/v1/matchmakingservice/ws?playerCustomKey${playerCustomKey}`,
        ticketType: "mms-player",
        payload: signedPayload,
        signature: signatureHash
    });
});

app.get("/fortnite/api/game/v1/matchmakingservice/ws", async (c) => {

    const playerCustomKey = c.req.query("playerCustomKey") || "none";

    console.log(`[Matchmaking] Player ${playerCustomKey} connected to matchmaker`);

    let id = c.env.MatchmakerServer.idFromName(playerCustomKey);
    let stub = c.env.MatchmakerServer.get(id) as DurableObjectStub<MatchmakerServer>;

    //TODO: Actually implement this
    const serverStarted = false;
    await stub.setProperty('matchOpen', serverStarted)

    return stub.fetch(c.req.raw);
});
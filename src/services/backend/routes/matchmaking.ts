import { app } from "@core/app";

//TODO: Implement the rest of the matchmaking API endpoints

app.get("/fortnite/api/matchmaking/session/findPlayer/*", (c) => {
    return c.sendStatus(200);
});

app.get("/fortnite/api/game/v2/matchmaking/account/:accountId/session/:sessionId", (c) => {
    return c.json({
        accountId: c.req.param("accountId"),
        sessionId: c.req.param("sessionId"),
        key: "none"
    });
});

app.post("/fortnite/api/matchmaking/session/:sessionId/join", (c) => {
    //TODO: Check if sessionId is valid and if server is ready to be joined
    const sessionId = c.req.param("sessionId");
    return c.sendStatus(204);
});

app.post("/fortnite/api/matchmaking/session/matchMakingRequest", (c) => {
    return c.json([])
});
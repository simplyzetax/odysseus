import { app } from "@core/app";

app.post("/fortnite/api/game/v2/chat/*/*/*/pc", (c) => {
    return c.json({ "GlobalChatRooms": [{ "roomName": "lawinserverglobal" }] });
});

app.post("/fortnite/api/game/v2/tryPlayOnPlatform/account/*", (c) => {
    return c.text("true");
});

app.get("/launcher/api/public/distributionpoints/", (c) => {
    return c.json({
        "distributions": [
            "https://download.odysseus.fortnite.ac",
        ]
    });
});

app.get("/launcher/api/public/assets/:someId", async (c) => {
    return c.json({
        appName: "FortniteContentBuilds",
        labelName: "Odysseus",
        buildVersion: c.misc.build.cl,
        catalogItemId: "5cb97847cee34581afdbc445400e2f77",
        expires: "9999-12-31T23:59:59.999Z",
        items: {
            MANIFEST: {
                signature: "Odysseus",
                distribution: "https://odysseus.ol.epicgames.com/",
                path: "Builds/Fortnite/Content/CloudDir/LawinServer.manifest",
                hash: "55bb954f5596cadbe03693e1c06ca73368d427f3",
                additionalDistributions: []
            },
            CHUNKS: {
                signature: "Odysseus",
                distribution: "https://odysseus.ol.epicgames.com/",
                path: "Builds/Fortnite/Content/CloudDir/LawinServer.manifest",
                additionalDistributions: []
            }
        },
        assetId: "FortniteContentBuilds"
    });
})

//TODO: Implement with asset fetcher
app.get("/Builds/Fortnite/Content/CloudDir/*.manifest", async () => {
    /*
        const manifest = fs.readFileSync(path.join(__dirname, "..", "responses", "CloudDir", "LawinServer.manifest"));
    
        return c.sendIni(manifest)
        */
})

//TODO: Implement with asset fetcher
app.get("/Builds/Fortnite/Content/CloudDir/*.chunk", async () => {

    /*const chunk = fs.readFileSync(path.join(__dirname, "..", "responses", "CloudDir", "LawinServer.chunk"));

    return c.sendIni(chunk)*/
})

app.get("/Builds/Fortnite/Content/CloudDir/*.ini", async () => {
    /*const ini = fs.readFileSync(path.join(__dirname, "..", "responses", "CloudDir", "Full.ini"));

    res.status(200).send(ini).end();
    */
})

app.get("/waitingroom/api/waitingroom", (c) => {
    return c.sendStatus(204);
});

app.get("/socialban/api/public/v1/*", (c) => {
    return c.json({
        bans: [],
        warnings: []
    });
});

app.get("/fortnite/api/game/v2/events/tournamentandhistory/*/EU/WindowsClient", (c) => {
    return c.json({});
});

app.get("/fortnite/api/statsv2/account/:accountId", (c) => {
    return c.json({
        "startTime": 0,
        "endTime": 0,
        "stats": {},
        "accountId": c.req.param("accountId")
    });
});

app.get("/statsproxy/api/statsv2/account/:accountId", (c) => {
    return c.json({
        "startTime": 0,
        "endTime": 0,
        "stats": {},
        "accountId": c.req.param("accountId")
    });
});

app.get("/fortnite/api/stats/accountId/:accountId/bulk/window/alltime", (c) => {
    return c.json({
        "startTime": 0,
        "endTime": 0,
        "stats": {},
        "accountId": c.req.param("accountId")
    });
});

app.post("/fortnite/api/feedback/*", (c) => {
    return c.sendStatus(200);
});

app.post("/fortnite/api/statsv2/query", (c) => {
    return c.json([]);
});

app.post("/statsproxy/api/statsv2/query", (c) => {
    return c.json([]);
});

app.post("/fortnite/api/game/v2/events/v2/setSubgroup/*", (c) => {
    return c.sendStatus(204);
});

app.get("/fortnite/api/game/v2/enabled_features", (c) => {
    return c.json([]);
});

app.get("/api/v1/events/Fortnite/download/*", (c) => {
    return c.json({});
});

app.get("/fortnite/api/game/v2/twitch/*", (c) => {
    return c.sendStatus(200);
});

app.get("/fortnite/api/game/v2/world/info", (c) => {
    return c.json({});
});

app.post("/fortnite/api/game/v2/chat/*/recommendGeneralChatRooms/pc", (c) => {
    return c.json({});
});

app.get("/fortnite/api/receipts/v1/account/*/receipts", (c) => {
    return c.json([]);
});

app.get("/fortnite/api/game/v2/leaderboards/cohort/*", (c) => {
    return c.json([]);
});

app.post("/datarouter/api/v1/public/data", (c) => {
    return c.sendStatus(204)
});
import { eq } from "drizzle-orm";
import { isNull } from "drizzle-orm";

import { app } from "@core/app";
import { getDB } from "@core/db/client";
import { CONTENT } from "@core/db/schemas/content";

// Fuck you epicgames for adding another unnecessary slash to this endpoint
// but ONLY this endpoint
app.get("/content/api/pages/fortnite-game", async (c) => {

    //TODO: Fix this bullshit or test it on S19+
    const contentpagesTemplate: Record<string, any> = {
        _title: "Fortnite Game",
        _activeDate: "2017-08-30T03:20:48.050Z",
        lastModified: "2019-11-01T17:33:35.346Z",
        _locale: "en-US",
        dynamicbackgrounds: {
            backgrounds: {
                backgrounds: [
                    {
                        backgroundimage: "https://iili.io/3I1e5fR.jpg",
                        stage: 'defaultnotris',
                        _type: 'DynamicBackground',
                        key: 'lobby'
                    },
                    {
                        backgroundimage: "https://iili.io/3I1e5fR.jpg",
                        stage: 'defaultnotris',
                        _type: 'DynamicBackground',
                        key: 'vault'
                    }
                ],
                _type: 'DynamicBackgroundList'
            },
            _title: "dynamicbackgrounds",
            _noIndex: false,
            _activeDate: "2019-08-21T15:59:59.342Z",
            lastModified: "2019-10-29T13:07:27.936Z",
            _locale: "en-US"
        }
    };

    const globalScopeContentEntries = await getDB(c).select().from(CONTENT);

    for (const entry of globalScopeContentEntries) {
        contentpagesTemplate[entry.key] = entry.valueJSON;
    }

    return c.json(contentpagesTemplate);
});

//export
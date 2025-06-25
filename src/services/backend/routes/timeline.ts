import { app } from "@core/app";

app.get("/fortnite/api/calendar/v1/timeline", (c) => {

    const activeEvents = [
        {
            eventType: `EventFlag.Season${c.misc.build.season}`,
            activeUntil: "9999-01-01T00:00:00.000Z",
            activeSince: "2020-01-01T00:00:00.000Z"
        },
        {
            eventType: `EventFlag.${c.misc.build.lobby}`,
            activeUntil: "9999-01-01T00:00:00.000Z",
            activeSince: "2020-01-01T00:00:00.000Z"
        }
    ];

    return c.json({
        channels: {
            "client-matchmaking": {
                states: [],
                cacheExpire: "9999-01-01T00:00:00.000Z"
            },
            "client-events": {
                states: [{
                    validFrom: "0001-01-01T00:00:00.000Z",
                    activeEvents: activeEvents,
                    state: {
                        activeStorefronts: [],
                        eventNamedWeights: {},
                        seasonNumber: c.misc.build.season,
                        seasonTemplateId: `AthenaSeason:athenaseason${c.misc.build.season}`,
                        matchXpBonusPoints: 0,
                        seasonBegin: "2020-01-01T00:00:00Z",
                        seasonEnd: "9999-01-01T00:00:00Z",
                        seasonDisplayedEnd: "9999-01-01T00:00:00Z",
                        weeklyStoreEnd: "9999-01-01T00:00:00Z",
                        stwEventStoreEnd: "9999-01-01T00:00:00.000Z",
                        stwWeeklyStoreEnd: "9999-01-01T00:00:00.000Z",
                        sectionStoreEnds: {
                            Featured: "9999-01-01T00:00:00.000Z"
                        },
                        dailyStoreEnd: "9999-01-01T00:00:00Z"
                    }
                }],
                cacheExpire: "9999-01-01T00:00:00.000Z"
            }
        },
        eventsTimeOffsetHrs: 0,
        cacheIntervalMins: 10,
        currentTime: new Date().toISOString()
    });
});
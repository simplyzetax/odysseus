import { app } from "../../../core/app";

app.get("/health", (c) => {
    return c.json({
        status: "ok",
        baseURL: DMNO_CONFIG.BASE_URL,
    });
});
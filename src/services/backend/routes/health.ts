import { app } from "../../../core/app";
import { env } from "cloudflare:workers";

app.get("/health", (c) => {
    return c.json({
        status: "ok",
        baseURL: env.BASE_URL,
    });
});
import { env } from "cloudflare:workers";
import { app } from "../../../core/app";

app.get("/health", (c) => {
    return c.json({
        status: "ok",
        baseURL: env.BASE_URL,
    });
});
import { app } from "../../../core/app";

app.get("/health", (c) => {
    return c.json({ status: "ok" });
});
import { app } from "@core/app";
import { clientTokenMiddleware } from "@middleware/auth/client-auth";

app.get("/lightswitch/api/service/:serviceName/status", clientTokenMiddleware, async (c) => {

    const service = c.req.param("serviceName");

    return c.json({
        serviceInstanceId: service,
        status: "UP",
        message: `${service} is online`,
        maintenanceUri: null,
        overrideCatalogIds: [
            "a7f138b2e51945ffbfdacc1af0541053"
        ],
        allowedActions: [],
        banned: false,
        launcherInfoDTO: {
            appName: service.charAt(0).toUpperCase() + service.slice(1),
            catalogItemId: "4fe75bbc5a674f4f9b356b5c90567da5",
            namespace: service
        }
    });
});

app.get("/lightswitch/api/service/bulk/status", clientTokenMiddleware, async (c) => {
    return c.json([{
        serviceInstanceId: "fortnite",
        status: "UP",
        message: "fortnite is up.",
        maintenanceUri: null,
        overrideCatalogIds: [
            "a7f138b2e51945ffbfdacc1af0541053"
        ],
        allowedActions: [
            "PLAY",
            "DOWNLOAD"
        ],
        banned: false,
        launcherInfoDTO: {
            appName: "Fortnite",
            catalogItemId: "4fe75bbc5a674f4f9b356b5c90567da5",
            namespace: "fn"
        }
    }]);
});
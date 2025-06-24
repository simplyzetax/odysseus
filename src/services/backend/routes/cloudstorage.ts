import { app } from "@core/app";
import { db } from "@core/db/client";
import { HOTFIXES } from "@core/db/schemas/hotfixes";
import { odysseus } from "@core/error";
import { clientTokenMiddleware } from "@middleware/auth/client-auth";
import { HotfixParser } from "@utils/hotfixe-parser";
import { sha1, sha256 } from "hono/utils/crypto";

//TODO: Implement client credentials authentication for these endpoints

app.get("/fortnite/api/cloudstorage/system", clientTokenMiddleware, async (c) => {

    const hotfixes = await db(c).select().from(HOTFIXES);

    const parser = new HotfixParser(hotfixes);
    // Get all .ini files for enabled global-scope hotfixes
    const iniFiles = parser.transformToIniFiles(false, 'global');

    const response = [];

    for (const [filename, content] of iniFiles) {
        response.push({
            uniqueFilename: filename,
            filename: filename,
            hash: await sha1(content),
            hash256: await sha256(content),
            length: content.length,
            contentType: "application/octet-stream",
            uploaded: new Date().toISOString(),
            storageType: "DB",
            storageIds: {},
            doNotCache: true
        });
    }

    return c.json(response);
});

app.get("/fortnite/api/cloudstorage/system/:filename", clientTokenMiddleware, async (c) => {

    const filename = c.req.param("filename");
    const hotfixes = await db(c).select().from(HOTFIXES);
    const parser = new HotfixParser(hotfixes);

    // Get .ini content for the specific file
    const content = parser.getIniForFile(filename, false, 'global');

    if (!content) {
        return c.sendError(odysseus.cloudstorage.fileNotFound.withMessage(`File ${filename} not found`));
    }

    return c.sendIni(content);
});
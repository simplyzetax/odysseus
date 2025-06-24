import { app } from "@core/app";
import { db } from "@core/db/client";
import { HOTFIXES } from "@core/db/schemas/hotfixes";
import { odysseus } from "@core/error";
import { acidMiddleware } from "@middleware/auth/acid";
import { clientTokenMiddleware } from "@middleware/auth/client-auth";
import { HotfixParser } from "@utils/hotfix-parser";
import { md5, sha1, sha256 } from "hono/utils/crypto";

const SETTINGS_FILE = "clientsettings.sav";

app.get("/fortnite/api/cloudstorage/system", clientTokenMiddleware, async (c) => {

    const hotfixes = await db(c).select().from(HOTFIXES);

    const parser = new HotfixParser(hotfixes);
    // Get all .ini files for enabled global-scope hotfixes (without timestamps for consistent hashing)
    const iniFiles = parser.transformToIniFiles(false, 'global', false);

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

    // Get .ini content for the specific file (without timestamp for consistent hashing)
    const content = parser.getIniForFile(filename, false, 'global', false);

    if (!content) {
        return c.sendError(odysseus.cloudstorage.fileNotFound.withMessage(`File ${filename} not found`));
    }

    return c.sendIni(content);
});

// User cloudstorage endpoints
app.get("/fortnite/api/cloudstorage/user/:accountId/:file", acidMiddleware, async (c) => {

    const fileName = c.req.param("file");
    if (fileName.toLowerCase() !== SETTINGS_FILE) {
        return c.sendError(odysseus.cloudstorage.fileNotFound.withMessage(`File ${fileName} not found`));
    }

    try {
        const file = await c.env.r2.get(`settings/${c.var.accountId}/${SETTINGS_FILE}`);
        if (!file) {
            return c.sendError(odysseus.cloudstorage.fileNotFound.withMessage(`File ${fileName} not found`));
        }

        const fileBuffer = await file.arrayBuffer();
        return c.body(fileBuffer);
    } catch (error) {
        console.error(`Error fetching user file ${fileName} for ${c.var.accountId}:`, error);
        return c.sendError(odysseus.cloudstorage.fileNotFound.withMessage(`Failed to fetch file ${fileName}`));
    }
});

app.get("/fortnite/api/cloudstorage/user/:accountId", acidMiddleware, async (c) => {

    try {
        const fileData = await c.env.r2.head(`settings/${c.var.accountId}/${SETTINGS_FILE}`);
        if (!fileData) {
            // Return empty array for client to enable saving settings
            return c.json([]);
        }

        const jsonResponse = [{
            uniqueFilename: SETTINGS_FILE,
            filename: SETTINGS_FILE,
            hash: fileData.checksums.sha1 || "",
            hash256: fileData.checksums.sha256 || "",
            length: fileData.size,
            contentType: fileData.httpMetadata?.contentType,
            uploaded: fileData.uploaded.toISOString(), // Fix timestamp issue
            storageType: "S3",
            storageIds: {
                "primary": fileData.etag
            },
            accountId: c.var.accountId,
            doNotCache: false
        }];

        return c.json(jsonResponse);
    } catch (error) {
        console.error(`Error fetching user file listing for ${c.var.accountId}:`, error);
        return c.sendError(odysseus.cloudstorage.fileNotFound.withMessage("Failed to fetch user files"));
    }
});

app.put("/fortnite/api/cloudstorage/user/:accountId/:file", acidMiddleware, async (c) => {

    const fileName = c.req.param("file");
    if (fileName.toLowerCase() !== SETTINGS_FILE) {
        return c.sendError(odysseus.cloudstorage.fileNotFound.withMessage(`File ${fileName} not found`));
    }

    try {
        const body = await c.req.arrayBuffer();
        if (!body || body.byteLength === 0) {
            return c.sendError(odysseus.cloudstorage.invalidBody);
        }

        // Calculate md5 hash for the file
        const fileHash = await md5(body);

        await c.env.r2.put(`settings/${c.var.accountId}/${SETTINGS_FILE}`, body, {
            httpMetadata: {
                contentType: "application/octet-stream",
            },
            md5: fileHash || "",
        });

        return c.sendStatus(204);
    } catch (error) {
        console.error(`Error saving settings for ${c.var.accountId}:`, error);
        return c.sendError(odysseus.cloudstorage.invalidBody.withMessage("Failed to save user settings"));
    }
});
import { app } from '@core/app';
import { getDB } from '@core/db/client';
import { HOTFIXES } from '@core/db/schemas/hotfixes';
import { odysseus } from '@core/error';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { devAuthMiddleware } from '@middleware/auth/devAuthMiddleware';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';
import { IniParser } from '@utils/misc/ini-parser';
import { sql } from 'drizzle-orm';
import { md5, sha1, sha256 } from 'hono/utils/crypto';

const SETTINGS_FILE = 'clientsettings.sav';

app.get('/fortnite/api/cloudstorage/system', ratelimitMiddleware(), async (c) => {
	const db = getDB(c.var.cacheIdentifier);
	const hotfixes = await db.select().from(HOTFIXES);

	const parser = new IniParser(hotfixes);
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
			contentType: 'application/octet-stream',
			uploaded: new Date().toISOString(),
			storageType: 'DB',
			storageIds: {},
			doNotCache: true,
		});
	}

	return c.json(response);
});

app.get('/fortnite/api/cloudstorage/system/:filename', ratelimitMiddleware(), async (c) => {
	const filename = c.req.param('filename');
	const hotfixes = await getDB(c.var.cacheIdentifier).select().from(HOTFIXES);
	const parser = new IniParser(hotfixes);

	// Get .ini content for the specific file (without timestamp for consistent hashing)
	const content = parser.getIniForFile(filename, false, 'global', false);

	if (!content) {
		return odysseus.cloudstorage.fileNotFound.withMessage(`File ${filename} not found`).toResponse();
	}

	return c.sendOctet(content);
});

app.post('/fortnite/api/cloudstorage/system/:filename', devAuthMiddleware, ratelimitMiddleware(), async (c) => {
	const formData = await c.req.formData();
	const file = formData.get('file');

	if (!(file instanceof File)) {
		return odysseus.authentication.invalidRequest.withMessage('File not provided or is invalid.').toResponse();
	}

	const filename = file.name;
	const body = await file.text();

	const db = getDB(c.var.cacheIdentifier);

	const newHotfixes = IniParser.parseIniToHotfixes(body, filename);
	if (newHotfixes.length > 0) {
		await db
			.insert(HOTFIXES)
			.values(newHotfixes)
			.onConflictDoUpdate({
				target: [HOTFIXES.filename, HOTFIXES.section, HOTFIXES.key],
				set: {
					value: sql`excluded.value`,
				},
			});
	} else {
		return odysseus.authentication.invalidRequest.withMessage('No new hotfixes found.').toResponse();
	}

	return c.json({
		success: true,
		message: 'Hotfixes uploaded successfully.',
		hotfixes: newHotfixes,
	});
});

// User cloudstorage endpoints
app.get('/fortnite/api/cloudstorage/user/:accountId/:file', ratelimitMiddleware(), acidMiddleware, async (c) => {
	const fileName = c.req.param('file');
	if (fileName.toLowerCase() !== SETTINGS_FILE) {
		return odysseus.cloudstorage.fileNotFound.withMessage(`File ${fileName} not found`).toResponse();
	}

	try {
		// First check if file exists using head() for better performance
		const fileData = await c.env.R2.head(`settings/${c.var.accountId}/${SETTINGS_FILE}`);
		if (!fileData) {
			return odysseus.cloudstorage.fileNotFound.withMessage(`File ${fileName} not found`).toResponse();
		}

		// File exists, now get the actual content
		const file = await c.env.R2.get(`settings/${c.var.accountId}/${SETTINGS_FILE}`);
		if (!file) {
			// This shouldn't happen since head() succeeded, but defensive programming
			return odysseus.cloudstorage.fileNotFound.withMessage(`File ${fileName} not found`).toResponse();
		}

		const fileBuffer = await file.arrayBuffer();
		return c.body(fileBuffer);
	} catch (error) {
		console.error(`Error fetching user file ${fileName} for ${c.var.accountId}:`, error);
		return odysseus.cloudstorage.fileNotFound.withMessage(`Failed to fetch file ${fileName}`).toResponse();
	}
});

app.get('/fortnite/api/cloudstorage/user/:accountId', ratelimitMiddleware(), acidMiddleware, async (c) => {
	try {
		const fileData = await c.env.R2.head(`settings/${c.var.accountId}/${SETTINGS_FILE}`);
		if (!fileData) {
			// Return empty array for client to enable saving settings
			return c.json([]);
		}

		const jsonResponse = [
			{
				uniqueFilename: SETTINGS_FILE,
				filename: SETTINGS_FILE,
				hash: fileData.checksums.sha1 || '',
				hash256: fileData.checksums.sha256 || '',
				length: fileData.size,
				contentType: fileData.httpMetadata?.contentType,
				uploaded: fileData.uploaded.toISOString(),
				storageType: 'S3',
				storageIds: {
					primary: fileData.etag,
				},
				accountId: c.var.accountId,
				doNotCache: false,
			},
		];

		return c.json(jsonResponse);
	} catch (error) {
		console.error(`Error fetching user file listing for ${c.var.accountId}:`, error);
		return odysseus.cloudstorage.fileNotFound.withMessage('Failed to fetch user files').toResponse();
	}
});

app.put('/fortnite/api/cloudstorage/user/:accountId/:file', ratelimitMiddleware(), acidMiddleware, async (c) => {
	const fileName = c.req.param('file');
	if (fileName.toLowerCase() !== SETTINGS_FILE) {
		return odysseus.cloudstorage.fileNotFound.withMessage(`File ${fileName} not found`).toResponse();
	}

	try {
		const body = await c.req.arrayBuffer();
		if (!body || body.byteLength === 0) {
			return odysseus.cloudstorage.invalidBody.toResponse();
		}

		// Calculate md5 hash for the file
		const fileHash = await md5(body);

		await c.env.R2.put(`settings/${c.var.accountId}/${SETTINGS_FILE}`, body, {
			httpMetadata: {
				contentType: 'application/octet-stream',
			},
			md5: fileHash || '',
		});

		return c.sendStatus(204);
	} catch (error) {
		console.error(`Error saving settings for ${c.var.accountId}:`, error);
		return odysseus.cloudstorage.invalidBody.withMessage('Failed to save user settings').toResponse();
	}
});

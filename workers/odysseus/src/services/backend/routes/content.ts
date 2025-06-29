import { app } from '@core/app';
import { odysseus } from '@core/error';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';

//TODO: See if it's possible to make Fortnite download custom binaries
// We can use the manifest parser and creator worker to modify them
app.get(
	'/Builds/Fortnite/Content/CloudDir/:filename',
	ratelimitMiddleware({
		initialTokens: 10,
		refillRate: 0.5,
		capacity: 10,
	}),
	acidMiddleware,
	async (c) => {
		const filename = c.req.param('filename');

		let fileToFetch: string;
		const isManifestFile = filename.endsWith('.manifest');

		switch (true) {
			case filename.endsWith('.ini'):
				fileToFetch = '/Content.ini';
				break;
			case isManifestFile:
				fileToFetch = '/Odysseus.manifest';
				break;
			case filename.endsWith('.chunk'):
				fileToFetch = '/Odysseus.chunk';
				break;
			default:
				return c.sendError(odysseus.cloudstorage.fileNotFound.withMessage('File not found'));
		}

		const url = new URL(c.req.url);
		url.pathname = fileToFetch;

		const file = await c.env.ASSETS.fetch(url.toString());
		let fileArrayBuffer = await file.arrayBuffer();

		// Only process manifest files to modify launch executable
		if (isManifestFile) {
			try {
				const parsed = await c.env.MANIFESTIFY.parseEpicManifest(new Uint8Array(fileArrayBuffer));
				//TODO:
				// Example: Setting the launch executable
				parsed.meta.launch_exe = 'FortniteGame.exe';
				// Example: Adding a prerequisite command
				parsed.meta.prereq_path = 'custom_tool.exe';
				parsed.meta.prereq_args = '--custom-flag';
				parsed.meta.prerequisites = ['custom_prerequisite'];
				console.log('Modified manifest');
				const modified = await c.env.MANIFESTIFY.createEpicManifest(parsed);
				// Convert Uint8Array to ArrayBuffer
				fileArrayBuffer = new ArrayBuffer(modified.length);
				new Uint8Array(fileArrayBuffer).set(modified);
			} catch (error) {
				// If manifest processing fails, return the original file
				console.error('Failed to process manifest:', error);
			}
		}

		return c.body(fileArrayBuffer);
	},
);

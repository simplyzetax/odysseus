import { app } from '@core/app';
import { odysseus } from '@core/error';

//TODO: See if it's possible to make Fortnite download custom binaries
app.get('/Builds/Fortnite/Content/CloudDir/:filename', async (c) => {
	const filename = c.req.param('filename');

	let fileToFetch: string;

	switch (true) {
		case filename.endsWith('.ini'):
			fileToFetch = '/Content.ini';
			break;
		case filename.endsWith('.manifest'):
			fileToFetch = '/Odysseus.manifest';
			break;
		case filename.endsWith('.chunk'):
			fileToFetch = '/Odysseus.manifest';
			break;
		default:
			return c.sendError(odysseus.cloudstorage.fileNotFound.withMessage('File not found'));
	}

	const url = new URL(c.req.url);
	url.pathname = fileToFetch;

	const iniFile = await c.env.ASSETS.fetch(url.toString());
	const iniContent = await iniFile.arrayBuffer();
	return c.body(iniContent);
});

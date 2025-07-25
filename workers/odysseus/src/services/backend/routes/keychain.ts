import { app } from '@core/app';

app.get('/fortnite/api/storefront/v2/keychain', async (c) => {
	const url = new URL(c.req.url);
	url.pathname = '/keychain.json';

	const file = await c.env.ASSETS.fetch(url.toString());
	const fileJson = await file.json<any>();

	return c.json(fileJson);
});

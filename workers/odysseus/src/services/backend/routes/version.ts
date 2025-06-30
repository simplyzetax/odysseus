import { app } from '@core/app';
import { odysseus } from '@core/error';

app.get('/fortnite/api/version', (c) => {
	if (!c.misc.build) return odysseus.internal.invalidUserAgent.toResponse();

	return c.json({
		app: 'fortnite',
		serverDate: new Date().toISOString(),
		overridePropertiesVersion: 'unknown',
		cln: c.misc.build.cl,
		build: '444',
		moduleName: 'Fortnite-Core',
		buildDate: new Date().toISOString(),
		version: c.misc.build.season,
		branch: `Release-${c.misc.build.season}`,
		modules: {
			'Epic-LightSwitch-AccessControlCore': {
				cln: '17237679',
				build: 'b2130',
				buildDate: c.env.CF_VERSION_METADATA.timestamp,
				version: '1.0.0',
				branch: 'trunk',
			},
			'epic-xmpp-api-v1-base': {
				cln: '5131a23c1470acbd9c94fae695ef7d899c1a41d6',
				build: 'b3595',
				buildDate: c.env.CF_VERSION_METADATA.timestamp,
				version: '0.0.1',
				branch: 'master',
			},
			'epic-common-core': {
				cln: '17909521',
				build: '3217',
				buildDate: c.env.CF_VERSION_METADATA.timestamp,
				version: '3.0',
				branch: 'TRUNK',
			},
		},
	});
});

app.get('/fortnite/api/v2/versioncheck/:platform', async (c) => {
	const shouldDoSoftUpdate = await c.env.KV.get('shouldDoSoftUpdate');

	if (!c.misc.build.season) return odysseus.internal.invalidUserAgent.toResponse();
	return c.json({
		type: shouldDoSoftUpdate ? 'SOFT_UPDATE' : 'NO_UPDATE',
	});
});

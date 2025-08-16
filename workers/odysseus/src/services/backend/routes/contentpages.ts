import { app } from '@core/app';
import { getDB } from '@core/db/client';
import { CONTENT } from '@core/db/schemas/content';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';

// Constants
const DEFAULT_BACKGROUND = 'https://iili.io/3I1e5fR.jpg';

const SEASON_BACKGROUNDS: Record<number, { stage?: string; image?: string }> = {
	19.01: {
		stage: 'winter2021',
		image: 'https://cdn.discordapp.com/attachments/927739901540188200/930880158167085116/t-bp19-lobby-xmas-2048x1024-f85d2684b4af.png',
	},
	20.4: {
		image: 'https://cdn2.unrealengine.com/t-bp20-40-armadillo-glowup-lobby-2048x2048-2048x2048-3b83b887cc7f.jpg',
	},
	20: {
		image: 'https://cdn2.unrealengine.com/t-bp20-lobby-2048x1024-d89eb522746c.png',
	},
	21: {
		image: 'https://cdn2.unrealengine.com/s21-lobby-background-2048x1024-2e7112b25dc3.jpg',
	},
};

// Epic Games added an extra slash to this endpoint (but only this one)
app.get('/content/api/pages/fortnite-game', ratelimitMiddleware(), async (c) => {
	const acceptLanguage = c.req.header('accept-language');
	const { season, build } = c.misc.build;
	const now = new Date().toISOString();

	// Parse language
	let language = 'en';
	if (acceptLanguage) {
		if (acceptLanguage.includes('-') && acceptLanguage !== 'es-419') {
			language = acceptLanguage.split('-')[0];
		} else {
			language = acceptLanguage;
		}
	}

	// Determine background configuration
	let stage = `season${season}`;
	let backgroundimage = DEFAULT_BACKGROUND;

	if (season === 10) stage = 'seasonx';
	if (build === 11.31 || build === 11.4) stage = 'Winter19';

	const bgConfig = SEASON_BACKGROUNDS[build] || SEASON_BACKGROUNDS[season];
	if (bgConfig) {
		if (bgConfig.stage) stage = bgConfig.stage;
		if (bgConfig.image) backgroundimage = bgConfig.image;
	}

	const contentpages: Record<string, any> = {
		_title: 'Fortnite Game',
		_activeDate: now,
		lastModified: now,
		_locale: 'en-US',
		dynamicbackgrounds: {
			backgrounds: {
				backgrounds: [
					{ backgroundimage, stage, _type: 'DynamicBackground', key: 'lobby' },
					{ backgroundimage: DEFAULT_BACKGROUND, stage, _type: 'DynamicBackground', key: 'vault' },
				],
				_type: 'DynamicBackgroundList',
			},
			_title: 'dynamicbackgrounds',
			_noIndex: false,
			_activeDate: '2019-08-21T15:59:59.342Z',
			lastModified: '2019-10-29T13:07:27.936Z',
			_locale: 'en-US',
		},
	};

	// Apply language localization if available
	const modes = ['saveTheWorldUnowned', 'battleRoyale', 'creative', 'saveTheWorld'];
	modes.forEach((mode) => {
		if (contentpages.subgameselectdata?.[mode]?.message) {
			const message = contentpages.subgameselectdata[mode].message;
			if (message.title?.[language]) message.title = message.title[language];
			if (message.body?.[language]) message.body = message.body[language];
		}
	});

	// Special build configurations
	if (build === 19.01) {
		contentpages.subgameinfo.battleroyale.image =
			'https://static.wikia.nocookie.net/fortnite/images/8/85/Chapter_3_Season_1_-_Keyart_-_Fortnite.jpg';
		contentpages.specialoffervideo.bSpecialOfferEnabled = 'true';
	}

	// Load custom content from database
	const customContent = await getDB(c.var.cacheIdentifier).select().from(CONTENT);
	customContent.forEach((entry) => {
		contentpages[entry.key] = entry.valueJSON;
	});

	return c.json(contentpages);
});

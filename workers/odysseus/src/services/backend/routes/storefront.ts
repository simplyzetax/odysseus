import { app } from '@core/app';
import { getDB } from '@core/db/client';
import type { Offer } from '@core/db/schemas/offer';
import { OFFERS } from '@core/db/schemas/offer';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';

const storefrontTemplate = {
	refreshIntervalHrs: 24,
	dailyPurchaseHrs: 24,
	expiration: '9999-12-31T00:00:00.000Z',
	storefronts: [
		{
			name: 'BRDailyStorefront',
			catalogEntries: [],
		},
		{
			name: 'BRWeeklyStorefront',
			catalogEntries: [],
		},
		{
			name: 'BRSeasonStorefront',
			catalogEntries: [],
		},
	],
};

const calatogEntryTemplate = {
	devName: '',
	offerId: '',
	fulfillmentIds: [],
	dailyLimit: -1,
	weeklyLimit: -1,
	monthlyLimit: -1,
	categories: [],
	prices: [
		{
			currencyType: 'MtxCurrency',
			currencySubType: '',
			regularPrice: 0,
			finalPrice: 0,
			saleExpiration: '9999-12-02T01:12:00Z',
			basePrice: 0,
		},
	],
	meta: { SectionId: 'Featured', TileSize: 'Small' },
	matchFilter: '',
	filterWeight: 0,
	appStoreId: [],
	requirements: [],
	offerType: 'StaticPrice',
	giftInfo: { bIsEnabled: true, forcedGiftBoxTemplateId: '', purchaseRequirements: [], giftRecordIds: [] },
	refundable: false,
	metaInfo: [
		{ key: 'SectionId', value: 'Featured' },
		{ key: 'TileSize', value: 'Small' },
	],
	displayAssetPath: '',
	itemGrants: [],
	sortPriority: 0,
	catalogGroupPriority: 0,
};

app.get(
	'/fortnite/api/storefront/v2/catalog',
	ratelimitMiddleware({
		initialTokens: 10,
		refillRate: 0.5,
		capacity: 10,
	}),
	async (c) => {
		const db = getDB(c.var.cacheIdentifier);
		const offers = await db.select().from(OFFERS);

		const catalog = JSON.parse(JSON.stringify(storefrontTemplate));

		const storefrontsMap: Record<Offer['type'], any> = {
			Daily: catalog.storefronts.find((s: any) => s.name === 'BRDailyStorefront'),
			Weekly: catalog.storefronts.find((s: any) => s.name === 'BRWeeklyStorefront'),
			Season: catalog.storefronts.find((s: any) => s.name === 'BRSeasonStorefront'),
		};

		for (const offer of offers) {
			const catalogEntry = JSON.parse(JSON.stringify(calatogEntryTemplate));

			catalogEntry.devName = offer.id;
			catalogEntry.offerId = offer.id;

			catalogEntry.itemGrants.push(...offer.itemGrants);
			catalogEntry.requirements.push({
				requirementType: 'DenyOnItemOwnership',
				requiredId: offer.itemGrants[0],
				minQuantity: 1,
			});

			catalogEntry.prices = [
				{
					currencyType: 'MtxCurrency',
					currencySubType: '',
					regularPrice: offer.price,
					finalPrice: offer.price,
					saleExpiration: '9999-12-02T01:12:00Z',
					basePrice: offer.price,
				},
			];

			if (offer.type === 'Daily') {
				catalogEntry.sortPriority = -1;
			} else if (offer.type === 'Weekly') {
				catalogEntry.meta.TileSize = 'Normal';
				catalogEntry.metaInfo[1].value = 'Normal';
			}

			const targetStorefront = storefrontsMap[offer.type];
			if (targetStorefront) {
				targetStorefront.catalogEntries.push(catalogEntry);
			}
		}

		return c.json(catalog);
	},
);

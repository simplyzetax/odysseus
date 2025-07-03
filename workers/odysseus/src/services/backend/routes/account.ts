import { app } from '@core/app';
import { getDB } from '@core/db/client';
import { ACCOUNTS } from '@core/db/schemas/account';
import { odysseus } from '@core/error';
import { accountMiddleware } from '@middleware/auth/accountMiddleware';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';
import { inArray, sql } from 'drizzle-orm';

app.get(
	'/account/api/public/account',
	ratelimitMiddleware({
		capacity: 10,
		initialTokens: 10,
		refillRate: 0.5,
	}),
	async (c) => {
		const accountIdQuery = c.req.query('accountId');
		if (!accountIdQuery) {
			return odysseus.account.invalidAccountIdCount.withMessage('Account ID is required').toResponse();
		}

		const db = getDB(c.var.cacheIdentifier);

		// Normalize accountIds to always be an array
		const accountIds = Array.isArray(accountIdQuery) ? accountIdQuery : [accountIdQuery];

		// Validate all account IDs are present
		for (const accountId of accountIds) {
			if (!accountId) {
				return odysseus.account.invalidAccountIdCount.withMessage('Account ID is required').toResponse();
			}
		}

		// Single query to fetch all accounts at once
		const accounts = await db.select().from(ACCOUNTS).where(inArray(ACCOUNTS.id, accountIds));

		// Check if all requested accounts were found
		if (accounts.length !== accountIds.length) {
			// Find which account IDs were not found
			const foundIds = new Set(accounts.map((acc) => acc.id));
			const missingIds = accountIds.filter((id) => !foundIds.has(id));
			return odysseus.account.accountNotFound.variable([missingIds[0]]).toResponse();
		}

		// Build response maintaining the original order
		const response = accountIds.map((requestedId) => {
			const account = accounts.find((acc) => acc.id === requestedId)!;
			return {
				id: account.id,
				displayName: account.displayName,
				externalAuths: {},
			};
		});

		return c.json(response);
	},
);

app.get(
	'/account/api/public/account/displayName/:displayName',
	ratelimitMiddleware({
		capacity: 10,
		initialTokens: 10,
		refillRate: 0.5,
	}),
	async (c) => {
		const displayName = c.req.param('displayName');
		if (!displayName) {
			return odysseus.account.accountNotFound.withMessage('Display name is required').toResponse();
		}

		const db = getDB(c.var.cacheIdentifier);

		// Fetch account by display name (case-insensitive)
		const [account] = await db
			.select()
			.from(ACCOUNTS)
			.where(sql`LOWER(${ACCOUNTS.displayName}) = LOWER(${displayName})`)
			.limit(1);

		if (!account) {
			return odysseus.account.accountNotFound.variable([displayName]).toResponse();
		}

		return c.json({
			id: account.id,
			displayName: account.displayName,
			externalAuths: {},
		});
	},
);

app.get(
	'/persona/api/public/account/lookup',
	ratelimitMiddleware({
		capacity: 10,
		initialTokens: 10,
		refillRate: 0.5,
	}),
	async (c) => {
		const q = c.req.query('q');
		if (typeof q !== 'string') {
			return odysseus.account.invalidAccountIdCount.withMessage("Query parameter 'q' is required").toResponse();
		}

		const db = getDB(c.var.cacheIdentifier);
		const [account] = await db
			.select()
			.from(ACCOUNTS)
			.where(sql`LOWER(${ACCOUNTS.displayName}) = LOWER(${q})`)
			.limit(1);

		if (!account) {
			return odysseus.account.accountNotFound.variable([q]).toResponse();
		}

		return c.json({
			id: account.id,
			displayName: account.displayName,
			externalAuths: {},
		});
	},
);

app.get(
	'/api/v1/search/:accountId',
	ratelimitMiddleware({
		capacity: 10,
		initialTokens: 10,
		refillRate: 0.5,
	}),
	async (c) => {
		const db = getDB(c.var.cacheIdentifier);

		const prefix = c.req.query('prefix') || '';
		if (!prefix) {
			return odysseus.account.invalidAccountIdCount.withMessage('Prefix query parameter is required').toResponse();
		}

		//find users starting with the prefix
		const accounts = await db
			.select()
			.from(ACCOUNTS)
			.where(sql`LOWER(${ACCOUNTS.displayName}) LIKE LOWER(${prefix}%)`)
			.limit(10);

		if (accounts.length === 0) {
			return c.json([]);
		}

		const response = accounts.map((account) => ({
			accountId: account.id,
			matches: [
				{
					value: account.displayName,
					platform: 'epic',
				},
			],
			matchType: prefix.toLowerCase() == account.displayName.toLowerCase() ? 'exact' : 'prefix',
			epicMutuals: 0,
			sortPosition: 0, //TODO: we might need to fix this
		}));

		return c.json(response);
	},
);

app.get(
	'/account/api/public/account/:accountId',
	accountMiddleware,
	ratelimitMiddleware({
		capacity: 10,
		initialTokens: 10,
		refillRate: 0.5,
	}),
	(c) => {
		const account = c.var.account;

		return c.json({
			id: account.id,
			displayName: account.displayName,
			name: account.displayName,
			email: `[redacted]@${account.email.split('@')[1]}`,
			failedLoginAttempts: 0,
			lastLogin: new Date().toISOString(),
			numberOfDisplayNameChanges: 0,
			ageGroup: 'UNKNOWN',
			headless: false,
			country: 'US',
			lastName: 'Server',
			preferredLanguage: 'en',
			canUpdateDisplayName: false,
			tfaEnabled: false,
			emailVerified: true,
			minorVerified: false,
			minorExpected: false,
			minorStatus: 'NOT_MINOR',
			cabinedMode: false,
			hasHashedEmail: false,
		});
	},
);

app.get('/account/api/public/account/:accountId/externalAuths', accountMiddleware, async (c) => {
	return c.json([]);
});

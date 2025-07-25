import type { Profile } from '@core/db/schemas/profile';
import type { Context } from 'hono';
import type { FortniteProfile } from '@utils/mcp/base-profile';
import { FortniteProfileWithDBProfile } from '@utils/mcp/base-profile';

export class AthenaProfile extends FortniteProfileWithDBProfile<'athena'> {
	constructor(accountId: string, baseProfile: FortniteProfile<'athena'>, dbProfile: Profile, cacheIdentifier: string) {
		super(accountId, baseProfile, dbProfile, cacheIdentifier);
	}
}

import type { Profile } from '@core/db/schemas/profile';
import type { Context } from 'hono';
import type { FortniteProfile } from '../base-profile';
import { FortniteProfileWithDBProfile } from '../base-profile';
import { Bindings } from '@otypes/bindings';

export class AthenaProfile extends FortniteProfileWithDBProfile<'athena'> {
	constructor(c: Context<{ Bindings: Bindings }>, accountId: string, baseProfile: FortniteProfile<'athena'>, dbProfile: Profile) {
		super(c, accountId, baseProfile, dbProfile.id);
	}
}

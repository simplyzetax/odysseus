import { ENV } from '@core/env';
import { odysseus } from '@core/error';
import type { EOS } from '@otypes/fortnite/eos';

class EosService {
	private readonly productId = ENV.EOS_PRODUCT_ID;
	private readonly sandboxId = ENV.EOS_SANDBOX_ID;
	private readonly deploymentId = ENV.EOS_DEPLOYMENT_ID;
	private readonly clientId = ENV.EOS_CLIENT_ID;
	private readonly clientSecret = ENV.EOS_CLIENT_SECRET;
	private readonly EOS_TOKEN_KEY = 'eos_token';

	private async eosFetch(url: string, options: RequestInit) {
		const response = await fetch(url, {
			...options,
			headers: {
				'User-Agent': 'EOS-SDK/1.14.1-18153445 (Windows) CSharpSamples/1.0.1',
				'X-EOS-Version': '1.14.1-18153445',
			},
		});
		return response;
	}

	public async generateJoinToken(partyId: string, accountId: string): Promise<EOS['room']> {
		const authorization = await this.getAuthorization();

		const response = await this.eosFetch(`https://api.epicgames.dev/rtc/v1/${this.deploymentId}/room/neo-${partyId}`, {
			method: 'POST',
			body: JSON.stringify({
				participants: [
					{
						puid: accountId,
						hardMuted: false,
					},
				],
			}),
			headers: {
				Authorization: `${authorization.token_type} ${authorization.access_token}`,
			},
		});

		if (response.status != 200) {
			console.log(authorization.token_type + ' ' + authorization.access_token);
			odysseus.internal.eosError.withMessage(response.statusText).throwHttpException();
		}

		return response.json();
	}

	private async getAuthorization(): Promise<EOS['oAuthToken']> {
		const cachedTokenValue = await ENV.KV.get(this.EOS_TOKEN_KEY, 'text');
		if (cachedTokenValue) {
			return JSON.parse(cachedTokenValue) as EOS['oAuthToken'];
		}

		const response = await this.eosFetch('https://api.epicgames.dev/auth/v1/oauth/token', {
			method: 'POST',
			body: new URLSearchParams({
				grant_type: 'client_credentials',
				deployment_id: this.deploymentId,
			}),
			headers: {
				Authorization: `Basic ${btoa(`${this.clientId}:${this.clientSecret}`)}`,
			},
		});

		if (response.status != 200) {
			odysseus.internal.eosError.withMessage(response.statusText).throwHttpException();
		}

		const responseData: EOS['oAuthToken'] = await response.json();

		if (!responseData.features.includes('Voice')) {
			odysseus.internal.eosError.withMessage('Missing Voice feature.').throwHttpException();
		}

		await ENV.KV.put(this.EOS_TOKEN_KEY, JSON.stringify(responseData), {
			expirationTtl: responseData.expires_in - 60,
		});

		return responseData;
	}
}

export const eosService = new EosService();

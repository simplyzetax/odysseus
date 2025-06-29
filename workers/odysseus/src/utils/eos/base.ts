import { ENV } from '@core/env';
import { odysseus } from '@core/error';
import type { EOS } from '@otypes/fortnite/eos';

const EosApiConstants = {
	BASE_URL: 'https://api.epicgames.dev',
	TOKEN_ENDPOINT: '/auth/v1/oauth/token',
	RTC_ENDPOINT: '/rtc/v1',
	USER_AGENT: 'EOS-SDK/1.14.1-18153445 (Windows) CSharpSamples/1.0.1',
	EOS_VERSION_HEADER: 'X-EOS-Version',
	EOS_VERSION: '1.14.1-18153445',
	KV_TOKEN_KEY: 'eos_token',
	GRANT_TYPE_CLIENT_CREDENTIALS: 'client_credentials',
	REQUIRED_FEATURE: 'Voice',
} as const;

class EosService {
	private readonly deploymentId = ENV.EOS_DEPLOYMENT_ID;
	private readonly clientId = ENV.EOS_CLIENT_ID;
	private readonly clientSecret = ENV.EOS_CLIENT_SECRET;

	private async eosFetch(url: string, options: RequestInit) {
		const headers = {
			...options.headers,
			'User-Agent': EosApiConstants.USER_AGENT,
			[EosApiConstants.EOS_VERSION_HEADER]: EosApiConstants.EOS_VERSION,
			Accept: 'application/json',
		};

		const response = await fetch(url, {
			...options,
			headers,
		});
		return response;
	}

	private async handleApiError(response: Response) {
		const errorDetails = (await response.json().catch(() => ({ message: 'Failed to parse error response' }))) as {
			errorMessage?: string;
			message?: string;
		};
		console.error('EOS API Error:', errorDetails);
		const errorMessage = errorDetails.errorMessage || errorDetails.message || response.statusText;
		odysseus.internal.eosError.withMessage(errorMessage).throwHttpException();
	}

	public async generateJoinToken(partyId: string, accountId: string): Promise<EOS['room']> {
		const authorization = await this.getAuthorization();
		const url = `${EosApiConstants.BASE_URL}${EosApiConstants.RTC_ENDPOINT}/${this.deploymentId}/room/neo-${partyId}`;

		const response = await this.eosFetch(url, {
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
				Authorization: `Bearer ${authorization.access_token}`,
				'Content-Type': 'application/json',
			},
		});

		if (response.status !== 200) {
			await this.handleApiError(response);
		}

		return response.json();
	}

	private async getAuthorization(): Promise<EOS['oAuthToken']> {
		const cachedTokenValue = await ENV.KV.get(EosApiConstants.KV_TOKEN_KEY, 'text');
		if (cachedTokenValue) {
			return JSON.parse(cachedTokenValue) as EOS['oAuthToken'];
		}

		const url = `${EosApiConstants.BASE_URL}${EosApiConstants.TOKEN_ENDPOINT}`;
		const response = await this.eosFetch(url, {
			method: 'POST',
			body: new URLSearchParams({
				grant_type: EosApiConstants.GRANT_TYPE_CLIENT_CREDENTIALS,
				deployment_id: this.deploymentId,
			}),
			headers: {
				Authorization: `Basic ${btoa(`${this.clientId}:${this.clientSecret}`)}`,
			},
		});

		if (response.status !== 200) {
			await this.handleApiError(response);
		}

		const responseData: EOS['oAuthToken'] = await response.json();

		if (!responseData.features.includes(EosApiConstants.REQUIRED_FEATURE)) {
			odysseus.internal.eosError.withMessage(`Missing ${EosApiConstants.REQUIRED_FEATURE} feature.`).throwHttpException();
		}

		await ENV.KV.put(EosApiConstants.KV_TOKEN_KEY, JSON.stringify(responseData), {
			expirationTtl: responseData.expires_in - 60,
		});

		return responseData;
	}
}

export const eosService = new EosService();

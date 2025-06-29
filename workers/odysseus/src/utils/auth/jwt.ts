import type { Account } from '@core/db/schemas/account';
import { env } from 'cloudflare:workers';
import { SignJWT, jwtVerify } from 'jose';
import { nanoid } from 'nanoid';
import type { ClientId } from './clients';

export enum GRANT_TYPES {
	client_credentials = 'client_credentials',
	password = 'password',
	refresh = 'refresh_token',
	exchange = 'exchange_code',
}

export type PossibleGrantTypes = `${GRANT_TYPES}`;

/**
 * A class for creating and verifying JWT tokens
 */
export class JWT {
	/**
	 * Gets the encoded JWT secret
	 * @returns The encoded secret
	 */
	static get encodedSecret() {
		return new TextEncoder().encode(env.JWT_SECRET);
	}

	/**
	 * Creates a client token
	 * @param clientId - The ID of the client
	 * @param grant_type - The grant type
	 * @param expiresIn - The expiration time in hours
	 * @returns The client token
	 */
	static async createClientToken(clientId: ClientId, grant_type: PossibleGrantTypes, expiresIn: number): Promise<string> {
		const expirationTime = Math.floor(Date.now() / 1000) + expiresIn * 3600; // Convert hours to seconds

		const token = await new SignJWT({
			p: nanoid(),
			clsvc: 'fortnite',
			t: 's',
			mver: false,
			clid: clientId,
			ic: true,
			am: grant_type,
			jti: nanoid(),
			creation_date: new Date(),
			hours_expire: expiresIn,
		})
			.setProtectedHeader({ alg: 'HS256' })
			.setExpirationTime(expirationTime)
			.sign(this.encodedSecret);

		return token;
	}

	/**
	 * Creates an access token
	 * @param account - The account
	 * @param clientId - The ID of the client
	 * @param grant_type - The grant type
	 * @param deviceId - The ID of the device
	 * @param expiresIn - The expiration time in hours
	 * @returns The access token
	 */
	static async createAccessToken(
		account: Account,
		clientId: ClientId,
		grant_type: PossibleGrantTypes,
		deviceId: string,
		expiresIn: number,
	) {
		const expirationTime = Math.floor(Date.now() / 1000) + expiresIn * 3600; // Convert hours to seconds

		const token = await new SignJWT({
			app: 'fortnite',
			sub: account.id,
			dvid: deviceId,
			mver: false,
			clid: clientId,
			dn: account.displayName,
			am: grant_type,
			p: btoa(nanoid()),
			iai: account.id,
			sec: 1,
			clsvc: 'fortnite',
			t: 's',
			ic: true,
			jti: nanoid(),
			creation_date: new Date(),
			hours_expire: expiresIn,
		})
			.setProtectedHeader({ alg: 'HS256' })
			.setExpirationTime(expirationTime)
			.sign(this.encodedSecret);

		return token;
	}

	/**
	 * Creates an exchange token
	 * @param account - The account
	 * @param clientId - The ID of the client
	 * @param deviceId - The ID of the device
	 * @param expiresIn - The expiration time in hours
	 * @returns The exchange token
	 */
	static async createExchangeToken(account: Account, clientId: ClientId, deviceId: string, expiresIn: number) {
		const expirationTime = Math.floor(Date.now() / 1000) + expiresIn * 3600; // Convert hours to seconds
		const token = await new SignJWT({
			sub: account.id,
			dvid: deviceId,
			t: 's',
			clid: clientId,
			am: GRANT_TYPES.exchange,
			jti: nanoid(),
			creation_date: new Date(),
			hours_expire: expiresIn,
		})
			.setProtectedHeader({ alg: 'HS256' })
			.setExpirationTime(expirationTime)
			.sign(this.encodedSecret);
		return token;
	}

	/**
	 * Creates a refresh token
	 * @param account - The account
	 * @param clientId - The ID of the client
	 * @param grantType - The grant type
	 * @param expiresIn - The expiration time in hours
	 * @param deviceId - The ID of the device
	 * @returns The refresh token
	 */
	static async createRefreshToken(
		account: Account,
		clientId: ClientId,
		grantType: PossibleGrantTypes,
		expiresIn: number,
		deviceId: string,
	) {
		const expirationTime = Math.floor(Date.now() / 1000) + expiresIn * 3600; // Convert hours to seconds

		const token = await new SignJWT({
			sub: account.id,
			dvid: deviceId,
			t: 'r',
			clid: clientId,
			am: grantType,
			jti: nanoid(),
			creation_date: new Date(),
			hours_expire: expiresIn,
		})
			.setProtectedHeader({ alg: 'HS256' })
			.setExpirationTime(expirationTime)
			.sign(this.encodedSecret);

		return token;
	}

	/**
	 * Verifies a JWT token
	 * @param token - The token to verify
	 * @returns The payload of the token
	 */
	static async verifyToken(token: string) {
		try {
			const { payload } = await jwtVerify(token, this.encodedSecret);
			return payload;
		} catch (error) {
			console.error('JWT verification failed:', error);
			return null;
		}
	}

	/**
	 * Adds hours to a date
	 * @param date - The date to add hours to
	 * @param hours - The number of hours to add
	 * @returns The new date
	 */
	static dateAddHours(date: Date, hours: number): Date {
		const newDate = new Date(date.getTime());
		newDate.setHours(newDate.getHours() + hours);
		return newDate;
	}
}

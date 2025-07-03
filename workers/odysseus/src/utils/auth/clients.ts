export const CLIENTS = {
	fn: {
		secret: 'fn_secret',
	},
	odysseus: {
		secret: 'odysseus_secret',
	},
	ec684b8c687f479fadea3cb2ad83f5c6: {
		secret: 'e1f31c211f28413186262d37a13fc84d',
	},
} as const;

/**
 * Checks if a client ID is valid
 * @param id - The client ID to check
 * @returns true if the client ID is valid and contained inside {@link CLIENTS}
 */
export const isValidClientId = (id: string): id is keyof typeof CLIENTS => {
	return Object.keys(CLIENTS).includes(id);
};

export type ClientId = keyof typeof CLIENTS;
export type ClientSecret = (typeof CLIENTS)[ClientId]['secret'];
export type Client = (typeof CLIENTS)[ClientId];

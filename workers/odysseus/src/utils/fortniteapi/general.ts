/**
 * Type definitions for Fortnite API responses
 */

import { AllCosmeticsResponseData, Client, Language } from 'fnapicom';

export const fnApiClient = new Client({
	language: Language.English,
});

type FortniteCosmetic = AllCosmeticsResponseData['data']['br'][number];

/**
 * Searches for cosmetics by name prefix
 * @param searchQuery The partial name to search for
 * @param limit Maximum number of results to return
 * @returns Array of matching cosmetics
 */
export async function searchCosmeticsByName(searchQuery: string, limit: number = 25) {
	try {
		let result: AllCosmeticsResponseData;
		const cache = caches.default;
		const cacheUrl = new URL(`/cosmetics?query=${encodeURIComponent(searchQuery)}`, 'https://fortnite.ac');
		const cacheRequest = new Request(cacheUrl.toString(), { method: 'GET' });
		const cachedResponse = await cache.match(cacheRequest);
		if (cachedResponse) {
			console.log('cache hit for ', searchQuery);
			result = await cachedResponse.json();
		} else {
			result = await fnApiClient.allCosmetics();
			const responseToCache = new Response(JSON.stringify(result), {
				headers: {
					'Cache-Control': 'public, max-age=3600',
					'Content-Type': 'application/json',
				},
			});
			await cache.put(cacheRequest, responseToCache);
		}

		console.log(result.status);
		const allCosmetics = result.data;
		if (!allCosmetics || !allCosmetics.br) return [];

		const searchLower = searchQuery.toLowerCase();

		// Filter cosmetics that start with or contain the search query (use .br since cosmetics are nested)
		const matches = allCosmetics.br.filter((cosmetic: FortniteCosmetic) => cosmetic.name.toLowerCase().includes(searchLower));

		// Handle duplicate names by making unique entries
		const uniqueNames = new Map<string, FortniteCosmetic[]>();
		matches.forEach((cosmetic: FortniteCosmetic) => {
			const name = cosmetic.name;
			if (!uniqueNames.has(name)) {
				uniqueNames.set(name, []);
			}
			uniqueNames.get(name)!.push(cosmetic);
		});

		// Create a new array with unique or specially formatted entries
		const dedupedMatches: FortniteCosmetic[] = [];
		uniqueNames.forEach((cosmeticsWithSameName) => {
			if (cosmeticsWithSameName.length === 1) {
				// Just add the single item
				dedupedMatches.push(cosmeticsWithSameName[0]);
			} else {
				// Add all items with type information to differentiate
				cosmeticsWithSameName.forEach((cosmetic) => {
					// Create a modified cosmetic with type info in the name
					const modifiedCosmetic = {
						...cosmetic,
						name: `${cosmetic.name} (${cosmetic.type.value})`,
					};
					dedupedMatches.push(modifiedCosmetic);
				});
			}
		});

		// Sort by exact match first, then by containment
		dedupedMatches.sort((a, b) => {
			const aStartsWith = a.name.toLowerCase().startsWith(searchLower);
			const bStartsWith = b.name.toLowerCase().startsWith(searchLower);

			if (aStartsWith && !bStartsWith) return -1;
			if (!aStartsWith && bStartsWith) return 1;
			return a.name.localeCompare(b.name);
		});

		return dedupedMatches.slice(0, limit);
	} catch (error) {
		console.error('Error searching cosmetics:', error);
		return [];
	}
}

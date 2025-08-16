/**
 * Type definitions for Fortnite API responses
 */

import { AllCosmeticsResponseData, Client, Language } from 'fnapicom';
import { WorkerCache } from '@utils/cache/workerCache';

export const fnApiClient = new Client({
	language: Language.English,
});

type FortniteCosmetic = AllCosmeticsResponseData['data']['br'][number];

// Cache for 2 hours since cosmetics don't change very frequently
const fortniteCache = WorkerCache.withPrefix('fortnite-api', 60 * 60 * 2);

/**
 * Gets all cosmetics data with caching
 * @returns All cosmetics data from API or cache
 */
async function getAllCosmeticsWithCache(): Promise<AllCosmeticsResponseData['data'] | null> {
	return await fortniteCache.getOrSet('all-cosmetics', async () => {
		console.log('Fetching fresh cosmetics data from API');
		const result = await fnApiClient.allCosmetics();
		console.log(`API status: ${result.status}`);

		if (!result.data) {
			throw new Error('No cosmetics data received from API');
		}

		return result.data;
	});
}

/**
 * Searches for cosmetics by name prefix
 * @param searchQuery The partial name to search for
 * @param limit Maximum number of results to return
 * @returns Array of matching cosmetics
 */
export async function searchCosmeticsByName(searchQuery: string, limit: number = 25) {
	try {
		const allCosmetics = await getAllCosmeticsWithCache();
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

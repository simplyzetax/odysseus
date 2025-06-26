/**
 * Type definitions for Fortnite API responses
 */

export interface FortniteAPIResponse<T> {
    status: number;
    data: T;
}

export interface FortniteCosmetic {
    id: string;
    name: string;
    description: string;
    type: {
        value: string;
        displayValue: string;
        backendValue: string;
    };
    rarity: {
        value: string;
        displayValue: string;
        backendValue: string;
    };
    series?: {
        value: string;
        image: string;
        colors: string[];
        backendValue: string;
    };
    set?: {
        value: string;
        text: string;
        backendValue: string;
    };
    introduction?: {
        chapter: string;
        season: string;
        text: string;
        backendValue: number;
    };
    images: {
        smallIcon?: string;
        icon: string;
        featured?: string;
        other?: Record<string, string>;
    };
    variants?: Array<{
        channel: string;
        type: string;
        options: Array<{
            tag: string;
            name: string;
            image: string;
        }>;
    }>;
    gameplayTags?: string[];
    showcaseVideo?: string;
    displayAssetPath?: string;
    definitionPath?: string;
    path: string;
    added: string;
    shopHistory?: string[];
}

/**
 * Fetches cosmetic data from Fortnite API
 * @param cosmeticId The ID of the cosmetic to fetch
 * @returns The cosmetic data or null if not found
 */
export async function fetchCosmeticById(cosmeticId: string): Promise<FortniteCosmetic | null> {
    try {

        const url = `https://fortnite-api.com/v2/cosmetics/br/${cosmeticId}`;

        const response = await fetch(url, {
            headers: {
                // You can add an API key if required
                // "Authorization": "YOUR_API_KEY"
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                return null; // Item not found
            }
            throw new Error(`API responded with status ${response.status}`);
        }

        const data: FortniteAPIResponse<FortniteCosmetic> = await response.json();

        return data.data;
    } catch (error) {
        console.error("Error fetching cosmetic:", error);
        return null;
    }
}

/**
 * Fetches cosmetic data from Fortnite API
 * @param cosmeticId The ID of the cosmetic to fetch
 * @returns The cosmetic data or null if not found
 */
export async function fetchAllCosmetics(): Promise<FortniteCosmetic[] | null> {
    try {

        const url = `https://fortnite-api.com/v2/cosmetics/br`;

        const response = await fetch(url);

        if (!response.ok) {
            if (response.status === 404) {
                return null; // Item not found
            }
            throw new Error(`API responded with status ${response.status}`);
        }

        const data: FortniteAPIResponse<FortniteCosmetic[]> = await response.json();

        return data.data;
    } catch (error) {
        console.error("Error fetching cosmetic:", error);
        return null;
    }
}

/**
 * Searches for cosmetics by name prefix
 * @param searchQuery The partial name to search for
 * @param limit Maximum number of results to return
 * @returns Array of matching cosmetics
 */
export async function searchCosmeticsByName(searchQuery: string, limit: number = 25): Promise<FortniteCosmetic[]> {
    try {
        const allCosmetics = await fetchAllCosmetics();
        if (!allCosmetics) return [];

        // Use local cache for faster searching after initial load
        const searchLower = searchQuery.toLowerCase();

        // Filter cosmetics that start with or contain the search query
        const matches = allCosmetics.filter(cosmetic =>
            cosmetic.name.toLowerCase().includes(searchLower)
        );

        // Handle duplicate names by making unique entries
        const uniqueNames = new Map<string, FortniteCosmetic[]>();
        matches.forEach(cosmetic => {
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
                cosmeticsWithSameName.forEach(cosmetic => {
                    // Create a modified cosmetic with type info in the name
                    const modifiedCosmetic = {
                        ...cosmetic,
                        name: `${cosmetic.name} (${cosmetic.type.value})`
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
    }
    catch (error) {
        console.error("Error searching cosmetics:", error);
        return [];
    }
}
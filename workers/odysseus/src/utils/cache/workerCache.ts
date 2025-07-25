/**
 * General purpose cache utility using Cloudflare Workers Cache API
 * Suitable for caching external API responses and other data
 */

export interface CacheOptions {
	/** Time to live in seconds */
	ttl?: number;
	/** Cache key prefix for organization */
	keyPrefix?: string;
}

export class WorkerCache {
	private readonly cache: Cache;
	private readonly defaultTtl: number;
	private readonly keyPrefix: string;

	/**
	 * Creates a new WorkerCache instance
	 * @param options - Cache configuration options
	 */
	constructor(options: CacheOptions = {}) {
		this.cache = caches.default;
		this.defaultTtl = options.ttl ?? 3600; // Default 1 hour
		this.keyPrefix = options.keyPrefix ?? 'worker-cache';
	}

	/**
	 * Gets data from cache
	 * @param key - Cache key
	 * @returns Cached data or null if not found/expired
	 */
	async get<T>(key: string): Promise<T | null> {
		try {
			const cacheUrl = this.buildCacheUrl(key);
			const response = await this.cache.match(cacheUrl);

			if (response) {
				const data = await response.json();
				console.log(`🎯 Cache HIT - Key: ${key}`);
				return data as T;
			}

			console.log(`❌ Cache MISS - Key: ${key}`);
			return null;
		} catch (error) {
			console.error(`❗ Cache GET error for key "${key}":`, error);
			return null;
		}
	}

	/**
	 * Sets data in cache
	 * @param key - Cache key
	 * @param data - Data to cache
	 * @param ttl - Optional TTL override in seconds
	 */
	async set<T>(key: string, data: T, ttl?: number): Promise<void> {
		try {
			const cacheTtl = ttl ?? this.defaultTtl;
			const cacheUrl = this.buildCacheUrl(key);

			const response = new Response(JSON.stringify(data), {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': `max-age=${cacheTtl}`,
				},
			});

			await this.cache.put(cacheUrl, response);
			console.log(`💾 Cache SET - Key: ${key}, TTL: ${cacheTtl}s`);
		} catch (error) {
			console.error(`❗ Cache SET error for key "${key}":`, error);
		}
	}

	/**
	 * Deletes a specific cache entry
	 * @param key - Cache key to delete
	 */
	async delete(key: string): Promise<void> {
		try {
			const cacheUrl = this.buildCacheUrl(key);
			await this.cache.delete(cacheUrl);
			console.log(`🗑️ Cache DELETE - Key: ${key}`);
		} catch (error) {
			console.error(`❗ Cache DELETE error for key "${key}":`, error);
		}
	}

	/**
	 * Gets data from cache or fetches it using the provided function
	 * @param key - Cache key
	 * @param fetchFn - Function to fetch data if not in cache
	 * @param ttl - Optional TTL override in seconds
	 * @returns Cached or freshly fetched data
	 */
	async getOrSet<T>(key: string, fetchFn: () => Promise<T>, ttl?: number): Promise<T | null> {
		try {
			// Try to get from cache first
			const cached = await this.get<T>(key);
			if (cached !== null) {
				return cached;
			}

			// Cache miss - fetch fresh data
			console.log(`🔄 Cache FETCH - Key: ${key}`);
			const freshData = await fetchFn();

			// Cache the fresh data
			await this.set(key, freshData, ttl);

			return freshData;
		} catch (error) {
			console.error(`❗ Cache getOrSet error for key "${key}":`, error);
			return null;
		}
	}

	/**
	 * Builds a cache URL for the given key
	 * @private
	 */
	private buildCacheUrl(key: string): string {
		return `https://cache.local/${this.keyPrefix}/${key}`;
	}

	/**
	 * Creates a cache instance with a specific prefix
	 * @param prefix - Key prefix for this cache instance
	 * @param ttl - Default TTL for this cache instance
	 * @returns New WorkerCache instance
	 */
	static withPrefix(prefix: string, ttl?: number): WorkerCache {
		return new WorkerCache({ keyPrefix: prefix, ttl });
	}
}

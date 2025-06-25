import { odysseus } from "@core/error";
import { Context } from "hono";
import { createMiddleware } from "hono/factory";

/**
 * Configuration options for token bucket rate limiting
 */
export interface RateLimitOptions {
    /** Maximum number of tokens in the bucket (burst capacity) */
    capacity?: number;
    /** Number of tokens to refill per second */
    refillRate?: number;
    /** Initial number of tokens when bucket is created */
    initialTokens?: number;
    /** Custom key generator function - defaults to IP address */
    keyGenerator?: (c: Context) => string | Promise<string>;
    /** Custom message when rate limit is exceeded */
    message?: string;
    /** Skip rate limiting if this function returns true */
    skip?: (c: Context) => boolean | Promise<boolean>;
    /** Custom headers to include in rate limit responses */
    standardHeaders?: boolean;
    /** Prefix for KV keys to avoid collisions */
    keyPrefix?: string;
}

/**
 * Token bucket data stored in KV
 */
interface TokenBucketData {
    /** Number of tokens available at lastUpdate time */
    tokens: number;
    /** Unix timestamp (seconds) of last update */
    lastUpdate: number;
}

/**
 * Default token bucket configuration
 */
const DEFAULT_OPTIONS: Required<RateLimitOptions> = {
    capacity: 10, // Maximum tokens in bucket (burst capacity)
    refillRate: 1, // Tokens added per second
    initialTokens: 10, // Start with full bucket
    keyGenerator: (c: Context) => {
        // Try to get real IP from Cloudflare headers, fallback to connection IP
        return c.req.header('CF-Connecting-IP') ||
            c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
            c.req.header('X-Real-IP') ||
            'unknown';
    },
    message: "Too many requests, please try again later.",
    skip: () => false,
    standardHeaders: true,
    keyPrefix: "tokenbucket"
};

/**
 * Calculates current token count based on time elapsed since last update
 */
function calculateCurrentTokens(
    storedTokens: number,
    lastUpdate: number,
    currentTime: number,
    refillRate: number,
    capacity: number
): number {
    const timeElapsed = currentTime - lastUpdate;
    const tokensToAdd = timeElapsed * refillRate;
    const newTokenCount = storedTokens + tokensToAdd;

    // Cap at maximum capacity
    return Math.min(newTokenCount, capacity);
}

/**
 * Creates a token bucket rate limiting middleware using Cloudflare KV for storage
 */
export const ratelimitMiddleware = (options: RateLimitOptions = {}) => {
    const config = { ...DEFAULT_OPTIONS, ...options };

    return createMiddleware(async (c: Context<{ Bindings: Env }>, next) => {
        // Check if we should skip rate limiting
        if (await config.skip(c)) {
            await next();
            return;
        }

        // Generate the key for this request
        const key = await config.keyGenerator(c);
        const kvKey = `${config.keyPrefix}:${key}`;

        // Get current time in seconds with high precision
        const now = Date.now() / 1000;

        try {
            // Get existing bucket data from KV
            const existingData = await c.env.kv.get(kvKey, "json") as TokenBucketData | null;

            let currentTokens: number;
            let lastUpdate: number;

            if (existingData) {
                // Calculate current tokens based on time elapsed
                currentTokens = calculateCurrentTokens(
                    existingData.tokens,
                    existingData.lastUpdate,
                    now,
                    config.refillRate,
                    config.capacity
                );
                lastUpdate = now;
            } else {
                // First request - start with initial token count
                currentTokens = config.initialTokens;
                lastUpdate = now;
            }

            // Check if we have enough tokens for this request
            if (currentTokens < 1) {
                // Calculate when next token will be available
                const timeUntilNextToken = (1 - currentTokens) / config.refillRate;
                const retryAfter = Math.ceil(timeUntilNextToken);

                // Set standard headers if enabled
                if (config.standardHeaders) {
                    c.res.headers.set('X-RateLimit-Limit', config.capacity.toString());
                    c.res.headers.set('X-RateLimit-Remaining', '0');
                    c.res.headers.set('X-RateLimit-Reset', Math.ceil(now + timeUntilNextToken).toString());
                }

                c.res.headers.set('Retry-After', retryAfter.toString());
                return c.sendError(odysseus.basic.throttled.withMessage(config.message));
            }

            // Consume one token
            const tokensAfterRequest = currentTokens - 1;

            // Set standard headers if enabled
            if (config.standardHeaders) {
                c.res.headers.set('X-RateLimit-Limit', config.capacity.toString());
                c.res.headers.set('X-RateLimit-Remaining', Math.floor(tokensAfterRequest).toString());
                // Reset time is when bucket will be full again
                const timeToFull = (config.capacity - tokensAfterRequest) / config.refillRate;
                c.res.headers.set('X-RateLimit-Reset', Math.ceil(now + timeToFull).toString());
            }

            // Defer KV update until after response is sent for better performance
            c.executionCtx.waitUntil(
                (async () => {
                    try {
                        // Update the bucket data in KV
                        const newData: TokenBucketData = {
                            tokens: tokensAfterRequest,
                            lastUpdate: now
                        };

                        // Calculate TTL: time for bucket to completely refill + buffer
                        const timeToRefill = Math.ceil((config.capacity - tokensAfterRequest) / config.refillRate);
                        const ttl = Math.max(timeToRefill + 300, 3600); // At least 1 hour, or refill time + 5 minutes

                        await c.env.kv.put(kvKey, JSON.stringify(newData), { expirationTtl: ttl });
                    } catch (error) {
                        console.error('Failed to update token bucket in KV:', error);
                    }
                })()
            );

            await next();

        } catch (error) {
            // If KV operations fail, log the error but don't block the request
            console.error('Token bucket middleware error:', error);
            await next();
        }
    });
};
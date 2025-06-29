import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { odysseus } from '@core/error';
import type { McpResponseBody } from '@otypes/fortnite/mcp';

/**
 * Parses the revision number from the rvn parameter
 * @param rvnParam - The revision parameter string
 * @returns The parsed revision number or 0 if invalid
 */
function parseRevisionNumber(rvnParam: string | undefined): number {
	const rvn = parseInt(rvnParam || '0', 10);

	if (isNaN(rvn) || rvn < 0) {
		odysseus.mcp.invalidPayload.withMessage('Invalid revision number').throwHttpException();
	}

	return rvn;
}

/**
 * Checks if the response contains JSON content
 * @param response - The response to check
 * @returns True if the response is JSON, false otherwise
 */
function isJsonResponse(response: Response): boolean {
	const contentType = response.headers.get('content-type');
	return contentType?.includes('application/json') ?? false;
}

/**
 * Middleware that parses and validates the revision number from the request
 * and adds profile revision information to the response so we don't have to handle
 * it manually in the routes.
 */
export const mcpCorrectionMiddleware = createMiddleware(async (c: Context<{ Bindings: Env }>, next) => {
	await next();

	// Skip correction if explicitly disabled
	if (c.flags.skipMcpCorrection) {
		return;
	}

	// Only process JSON responses
	if (!isJsonResponse(c.res)) {
		return;
	}

	try {
		// Parse and validate revision number from query
		const revisionNumber = parseRevisionNumber(c.req.query('rvn'));

		// Clone response to avoid consuming the original stream
		const responseClone = c.res.clone();
		const responseBody = await responseClone.json();

		if (typeof responseBody !== 'object' || responseBody === null) {
			return;
		}

		// Add MCP revision data to the response body
		const enhancedBody: McpResponseBody = {
			...responseBody,
			profileRevision: revisionNumber + 1,
			profileChangesBaseRevision: revisionNumber,
			profileCommandRevision: revisionNumber + 1,
		};

		// Create new headers without content-length (will be recalculated)
		const newHeaders = new Headers(c.res.headers);
		newHeaders.delete('content-length');

		// Create new response with enhanced body
		c.res = new Response(JSON.stringify(enhancedBody), {
			status: c.res.status,
			statusText: c.res.statusText,
			headers: newHeaders,
		});
	} catch (error) {
		// Log error for debugging but don't break the response
		console.error('MCP correction middleware error:', error);
		// Return original response unchanged
		return;
	}
});

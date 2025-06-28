import { app } from '@core/app';

/**
 * XMPP WebSocket route
 * Handles WebSocket upgrade requests for XMPP connections
 */
app.get('/xmpp', async (c) => {
	const upgradeHeader = c.req.header('upgrade');
	if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
		return c.text('Expected WebSocket upgrade', 426);
	}

	const protocol = c.req.header('sec-websocket-protocol');
	if (!protocol || protocol.toLowerCase() !== 'xmpp') {
		return c.text('Expected XMPP protocol', 400);
	}

	// Get or create a Durable Object instance
	// We use a single instance for all XMPP connections to enable cross-client messaging
	const durableObjectId = c.env.XmppServer.idFromName('xmpp-server');
	const durableObject = c.env.XmppServer.get(durableObjectId);

	// Forward the request to the Durable Object
	return durableObject.fetch(c.req.raw);
});

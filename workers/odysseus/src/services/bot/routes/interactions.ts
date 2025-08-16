import { app } from '@core/app';
import { discordVerificationMiddleware } from '@middleware/discord/discordVerification';
import { handleInteraction } from '@services/bot/handlers/interactionRouter';

// Apply Discord verification middleware
app.use('/discord/bot/interactions', discordVerificationMiddleware);

// Handle Discord interactions
app.post('/discord/bot/interactions', async (c) => {
	const rawBody = await c.req.text();
	if (!rawBody) {
		console.error('rawBody is undefined');
		throw new Error('rawBody is undefined');
	}

	return handleInteraction(rawBody, c);
});

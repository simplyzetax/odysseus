import { app } from '@core/app';
import { DISCORD_COMMANDS } from '@services/bot/config/commandDefinitions';
import { RouteBases, Routes, RESTPutAPIApplicationCommandsResult, RESTError } from 'discord-api-types/v10';
import { devAuthMiddleware } from '@middleware/auth/devAuthMiddleware';

app.post('/discord/bot/commands', devAuthMiddleware, async (c) => {
	const { DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID } = c.env;

	if (!DISCORD_BOT_TOKEN || !DISCORD_APPLICATION_ID) {
		return c.json({ error: 'Missing environment variables' }, 400);
	}

	try {
		// Global commands
		const response = await fetch(`${RouteBases.api}${Routes.applicationCommands(DISCORD_APPLICATION_ID)}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
			},
			body: JSON.stringify(DISCORD_COMMANDS),
		});

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ message: 'Unknown error' }))) as RESTError;
			return c.json({ error: `Error registering commands: ${errorData.message}` }, 500);
		}

		const data = (await response.json()) as RESTPutAPIApplicationCommandsResult;
		return c.json({ commands: data });
	} catch (error: any) {
		return c.json({ error: error.message }, 500);
	}
});

// Endpoint to delete commands from Discord
app.delete('/discord/bot/commands', devAuthMiddleware, async (c) => {
	const { DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID } = c.env;

	if (!DISCORD_BOT_TOKEN || !DISCORD_APPLICATION_ID) {
		return c.json({ error: 'Missing environment variables' }, 400);
	}

	try {
		const { commandId } = c.req.query();

		// If commandId is provided, delete specific command
		if (commandId) {
			const response = await fetch(`https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands/${commandId}`, {
				method: 'DELETE',
				headers: {
					Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
				},
			});

			if (!response.ok) {
				const text = await response.text();
				return c.json({ error: `Error deleting command: ${text}` }, 500);
			}

			return c.json({ success: true, message: `Command ${commandId} deleted` });
		}
		// If no commandId, delete all commands by overwriting with empty array
		else {
			const response = await fetch(`https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
				},
				body: JSON.stringify([]),
			});

			if (!response.ok) {
				const text = await response.text();
				return c.json({ error: `Error deleting all commands: ${text}` }, 500);
			}

			return c.json({ success: true, message: 'All commands deleted' });
		}
	} catch (error: any) {
		return c.json({ error: error.message }, 500);
	}
});

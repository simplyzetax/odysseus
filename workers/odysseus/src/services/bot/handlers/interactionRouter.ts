import { DiscordAPI } from '@utils/discord/general';
import { commandsMap } from '@services/bot/commands/index';
import { handleAutocomplete } from './autocomplete';
import { handleMessageComponent } from './messageComponent';
import {
	InteractionType,
	type APIInteraction,
	type APIApplicationCommandInteraction,
	type APIMessageComponentInteraction,
} from 'discord-api-types/v10';

/**
 * Handles incoming Discord interactions and routes them to appropriate handlers
 * @param rawBody - The raw interaction payload from Discord
 * @param c - The Hono context object
 * @returns Response object for the Discord interaction
 */
export async function handleInteraction(rawBody: string, c: any): Promise<Response> {
	const discord = DiscordAPI.construct(c.env);

	// Parse the interaction
	const interaction = discord.parseInteraction(rawBody) as APIInteraction;

	// Handle Discord's PING verification
	if (interaction.type === InteractionType.Ping) {
		return new Response(JSON.stringify(discord.createPingResponse()), {
			headers: { 'Content-Type': 'application/json' },
		});
	}

	// Route interactions based on type
	switch (interaction.type) {
		case InteractionType.ApplicationCommandAutocomplete:
			return handleAutocomplete(interaction);

		case InteractionType.ApplicationCommand: {
			const commandInteraction = interaction as APIApplicationCommandInteraction;
			const { name: commandName } = commandInteraction.data;

			// Find and execute the command
			const command = commandsMap.get(commandName);
			if (command) {
				return command.execute(commandInteraction, c);
			}

			// Command not found
			return new Response(JSON.stringify(discord.createMessageResponse(`Command '${commandName}' not implemented.`, true)), {
				headers: { 'Content-Type': 'application/json' },
			});
		}

		case InteractionType.MessageComponent:
			return handleMessageComponent(interaction as APIMessageComponentInteraction, c);

		default:
			// Return a 400 for unhandled interaction types
			return new Response(JSON.stringify({ error: 'Unhandled interaction type' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
	}
}

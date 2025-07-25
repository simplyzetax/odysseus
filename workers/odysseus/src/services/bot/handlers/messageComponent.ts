import { DiscordAPI } from '@utils/discord/general';
import type { APIMessageComponentInteraction } from 'discord-api-types/v10';

/**
 * Handles Discord message component interactions (buttons, select menus, etc.)
 * @param interaction - The message component interaction from Discord
 * @param c - The Hono context object
 * @returns Response object for the Discord interaction
 */
export async function handleMessageComponent(interaction: APIMessageComponentInteraction, c: any): Promise<Response> {
	const discord = DiscordAPI.construct(c.env);
	const customId = interaction.data.custom_id;

	// Handle different component interactions based on custom_id
	// Add specific handlers here as needed

	return new Response(JSON.stringify(discord.createMessageResponse(`You interacted with component: ${customId}`, true)), {
		headers: { 'Content-Type': 'application/json' },
	});
}

import { getDB } from '@core/db/client';
import { ACCOUNTS } from '@core/db/schemas/account';
import { DiscordAPI } from '@utils/discord/general';
import type { CommandHandler } from '@services/bot/types/interactions';
import { Bindings } from '@otypes/bindings';
import { Context } from 'hono';

export const pingCommand: CommandHandler = {
	name: 'ping',
	async execute(interaction, c: Context<{ Variables: { databaseIdentifier: string }, Bindings: Bindings }>) {
		const discord = DiscordAPI.construct(c.env);
		const db = getDB(c.var.databaseIdentifier);

		// Send initial deferred response
		const deferredResponse = discord.createDeferredResponse(true);

		// Update the message with latency information after processing
		c.executionCtx.waitUntil(
			(async () => {
				try {
					// Get Cloudflare request info
					const cfRay = c.req.header('cf-ray') || 'Unknown';
					const cfWorker = c.req.header('cf-worker') || 'Unknown';

					// Measure Discord API latency
					const discordStart = performance.now();
					await fetch('https://discord.com/api/v10/gateway');
					const discordLatency = performance.now() - discordStart;

					// Measure database latency
					const dbStart = performance.now();
					await db.select().from(ACCOUNTS).limit(1);
					const dbLatency = performance.now() - dbStart;

					// Create embed with latency info
					const embed = discord.createEmbed({
						title: '🏓 Pong!',
						description: 'System status information',
						color: 0x5865f2,
						fields: [
							{
								name: 'Discord API',
								value: `${Math.round(discordLatency)}ms`,
								inline: true,
							},
							{
								name: 'Database',
								value: `${Math.round(dbLatency)}ms`,
								inline: true,
							},
							{
								name: 'Worker',
								value: cfWorker,
								inline: true,
							},
							{
								name: 'CF Ray',
								value: cfRay,
								inline: true,
							},
							{
								name: 'Region',
								value: c.req.header('cf-region') || 'Unknown',
								inline: true,
							},
						],
					});

					// Edit original response with the embed
					await discord.editOriginalResponse(interaction.token, { embeds: [embed] });
				} catch (error) {
					await discord.handleError(error instanceof Error ? error : new Error(String(error)), interaction.token);
				}
			})(),
		);

		return new Response(JSON.stringify(deferredResponse), {
			headers: { 'Content-Type': 'application/json' },
		});
	},
};

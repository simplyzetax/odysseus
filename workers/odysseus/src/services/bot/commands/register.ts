import { getDB } from '@core/db/client';
import { ACCOUNTS } from '@core/db/schemas/account';
import { PROFILES, profileTypesEnum } from '@core/db/schemas/profile';
import { DiscordAPI } from '@utils/discord/general';
import { eq } from 'drizzle-orm';
import type { CommandHandler } from '@services/bot/types/interactions';

export const registerCommand: CommandHandler = {
	name: 'register',
	async execute(interaction, c) {
		const discord = DiscordAPI.construct(c.env);
		const db = getDB(c.var.cacheIdentifier);

		// Send deferred response
		const deferredResponse = discord.createDeferredResponse(true);

		// Process in background
		c.executionCtx.waitUntil(
			(async () => {
				try {
					// Get the user
					const user = discord.getInteractionUser(interaction);
					if (!user) throw new Error('User not found');

					const [existingAccount] = await db.select().from(ACCOUNTS).where(eq(ACCOUNTS.discordId, user.id));
					if (existingAccount) throw new Error('You have already registered');

					const email = `${crypto.randomUUID()}@fortnite.ac`;
					const password = crypto.randomUUID();

					// Create the account
					const [account] = await db
						.insert(ACCOUNTS)
						.values({
							email,
							displayName: user.global_name ?? 'Unset',
							discordId: user.id,
							passwordHash: '',
						})
						.returning();

					// Create profiles
					for (const profileType of Object.values(profileTypesEnum)) {
						await db.insert(PROFILES).values({
							accountId: account.id,
							type: profileType,
						});
					}

					// Create embed with account info
					const embed = discord.createEmbed({
						description: 'Successfully registered! You can now use the provided email and password to login and test the backend.',
						color: 0x5865f2,
						fields: [
							{
								name: 'Email',
								value: `\`${email}\``,
								inline: false,
							},
							{
								name: 'Password',
								value: `||${password}||`,
								inline: false,
							},
						],
					});

					// Edit response with embed
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

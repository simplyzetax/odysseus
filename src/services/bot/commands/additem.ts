import { getDB } from '@core/db/client';
import { ACCOUNTS } from '@core/db/schemas/account';
import { ITEMS } from '@core/db/schemas/items';
import { PROFILES } from '@core/db/schemas/profile';
import { createDiscordAPI } from '@utils/discord/general';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { ApplicationCommandOptionType } from 'discord-api-types/v10';
import { and, eq } from 'drizzle-orm';
import type { CommandHandler } from '@services/bot/types/interactions';
import { fnApiClient } from '@utils/fortniteapi/general';

export const additemCommand: CommandHandler = {
	name: 'additem',
	async execute(interaction, c) {
		const discord = createDiscordAPI(c.env);
		const db = getDB(c);

		const deferredResponse = discord.createDeferredResponse(true);

		c.executionCtx.waitUntil(
			(async () => {
				try {
					const itemId = discord.getOptionValue(interaction, 'item_id', ApplicationCommandOptionType.String);
					const profileType = discord.getOptionValue(interaction, 'profile_type', ApplicationCommandOptionType.String);

					if (!itemId) throw new Error('Item ID is required');
					if (!profileType) throw new Error('Profile type is required');

					if (!FortniteProfile.isValidProfileType(profileType)) throw new Error('Invalid profile type');

					const itemTemplateId = itemId.split(':')[1];
					if (!itemTemplateId) throw new Error('You need to provide a valid item ID (e.g. AthenaCharacter:CID_012...)');

					// Fetch item data from Fortnite API directly
					const itemData = (await fnApiClient.brCosmeticByID(itemTemplateId)).data;
					if (!itemData) throw new Error(`Item with ID "${itemTemplateId}" not found`);

					// Get user and find account
					const user = discord.getInteractionUser(interaction);
					if (!user) throw new Error('User not found');

					const [userAccount] = await db.select().from(ACCOUNTS).where(eq(ACCOUNTS.discordId, user.id));
					if (!userAccount) throw new Error('You need to register first using /register');

					const [profile] = await db
						.select()
						.from(PROFILES)
						.where(and(eq(PROFILES.accountId, userAccount.id), eq(PROFILES.type, profileType)));

					if (!profile) throw new Error('Profile not found');

					// Add item to user's profile
					await db.insert(ITEMS).values({
						profileId: profile.id,
						templateId: itemId,
					});

					// Create success embed
					const embed = discord.createEmbed({
						title: 'Item Added Successfully',
						description: 'The item has been added to your account.',
						color: 0x5865f2,
						fields: [
							{
								name: 'Item Name',
								value: itemData.name || 'Unknown',
								inline: true,
							},
							{
								name: 'Item ID',
								value: `\`${itemTemplateId}\``,
								inline: true,
							},
							{
								name: 'Rarity',
								value: itemData.rarity?.displayValue || 'Unknown',
								inline: false,
							},
						],
						thumbnail: itemData.images.icon,
					});

					await discord.editOriginalResponse(interaction.token, { embeds: [embed] });
				} catch (error) {
					await discord.handleError(error instanceof Error ? error : new Error(String(error)), interaction.token);
				}
			})()
		);

		return new Response(JSON.stringify(deferredResponse), {
			headers: { 'Content-Type': 'application/json' },
		});
	},
};

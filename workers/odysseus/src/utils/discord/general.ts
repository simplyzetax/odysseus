import nacl from 'tweetnacl';

/**
 * Verifies that a request is coming from Discord
 * @param body The raw request body
 * @param signature The signature from the X-Signature-Ed25519 header
 * @param timestamp The timestamp from the X-Signature-Timestamp header
 * @param clientPublicKey The Discord application public key
 * @returns Whether the request is verified as coming from Discord
 */
export function verifyKey(body: string, signature: string, timestamp: string, clientPublicKey: string): boolean {
	try {
		const isVerified = nacl.sign.detached.verify(
			Buffer.from(timestamp + body),
			Buffer.from(signature, 'hex'),
			Buffer.from(clientPublicKey, 'hex'),
		);
		return isVerified;
	} catch (e) {
		console.log(e);
		console.error('Invalid verifyKey parameters');
		return false;
	}
}

import {
	APIEmbed,
	APIEmbedField,
	APIInteraction,
	APIInteractionResponse,
	APIInteractionResponseCallbackData,
	APIInteractionResponseChannelMessageWithSource,
	APIInteractionResponseDeferredChannelMessageWithSource,
	APIInteractionResponsePong,
	APIMessage,
	APIModalInteractionResponseCallbackData,
	APIUser,
	ApplicationCommandOptionType,
	ApplicationCommandType,
	InteractionResponseType,
	InteractionType,
	MessageFlags,
	RESTPostAPIApplicationCommandsJSONBody,
	RESTPostAPIWebhookWithTokenJSONBody,
	RESTPutAPIApplicationCommandsResult,
	Routes,
	RouteBases,
	APIApplicationCommandInteractionDataBasicOption,
} from 'discord-api-types/v10';
import { ENV } from '@core/env';

/**
 * A comprehensive Discord API wrapper for simplified interaction with Discord's API
 */
export class DiscordAPI {
	private applicationId: string;
	private botToken: string;
	private publicKey: string;

	constructor(applicationId: string, botToken: string, publicKey: string) {
		this.applicationId = applicationId;
		this.botToken = botToken;
		this.publicKey = publicKey;
	}

	/**
	 * Verifies that a request came from Discord
	 */
	verifyRequest(body: string, signature: string, timestamp: string): boolean {
		return verifyKey(body, signature, timestamp, this.publicKey);
	}

	/**
	 * Parse and validate an incoming interaction
	 */
	parseInteraction(rawBody: string): APIInteraction {
		if (!rawBody) {
			throw new Error('Empty request body');
		}

		return JSON.parse(rawBody) as APIInteraction;
	}

	/**
	 * Respond to a Discord ping interaction
	 */
	createPingResponse(): APIInteractionResponsePong {
		return {
			type: InteractionResponseType.Pong,
		};
	}

	/**
	 * Create an immediate response to an interaction
	 */
	createMessageResponse(content: string, ephemeral = false): APIInteractionResponseChannelMessageWithSource {
		return {
			type: InteractionResponseType.ChannelMessageWithSource,
			data: {
				content,
				flags: ephemeral ? MessageFlags.Ephemeral : undefined,
			},
		};
	}

	/**
	 * Create an embed message response
	 */
	createEmbedResponse(embed: APIEmbed | APIEmbed[], ephemeral = false): APIInteractionResponseChannelMessageWithSource {
		const embeds = Array.isArray(embed) ? embed : [embed];

		return {
			type: InteractionResponseType.ChannelMessageWithSource,
			data: {
				embeds,
				flags: ephemeral ? MessageFlags.Ephemeral : undefined,
			},
		};
	}

	/**
	 * Create a deferred response (thinking state)
	 */
	createDeferredResponse(ephemeral = false): APIInteractionResponseDeferredChannelMessageWithSource {
		return {
			type: InteractionResponseType.DeferredChannelMessageWithSource,
			data: {
				flags: ephemeral ? MessageFlags.Ephemeral : undefined,
			},
		};
	}

	/**
	 * Create a modal response
	 */
	createModalResponse(customId: string, title: string, components: any[]): APIInteractionResponse {
		return {
			type: InteractionResponseType.Modal,
			data: {
				custom_id: customId,
				title,
				components,
			} as APIModalInteractionResponseCallbackData,
		};
	}

	/**
	 * Extracts the command options from an interaction
	 */
	getCommandOptions(interaction: APIInteraction): APIApplicationCommandInteractionDataBasicOption[] | undefined {
		if (interaction.type !== InteractionType.ApplicationCommand || interaction.data.type !== ApplicationCommandType.ChatInput) {
			return undefined;
		}

		// Filter options to only include basic options with values
		return interaction.data.options?.filter((option): option is APIApplicationCommandInteractionDataBasicOption => 'value' in option);
	}

	/**
	 * Get a specific option value from a command interaction
	 */
	getOptionValue<T = string>(interaction: APIInteraction, optionName: string, optionType?: ApplicationCommandOptionType): T | undefined {
		const options = this.getCommandOptions(interaction);
		if (!options) return undefined;

		const option = options.find((opt) => opt.name === optionName);

		if (!option) return undefined;
		if (optionType && option.type !== optionType) return undefined;

		return option.value as unknown as T;
	}

	/**
	 * Get the user from an interaction
	 */
	getInteractionUser(interaction: APIInteraction): APIUser | undefined {
		return interaction.member?.user || interaction.user;
	}

	/**
	 * Edit the original response
	 */
	async editOriginalResponse(interactionToken: string, data: RESTPostAPIWebhookWithTokenJSONBody): Promise<APIMessage> {
		const response = await fetch(`${RouteBases.api}${Routes.webhookMessage(this.applicationId, interactionToken, '@original')}`, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bot ${this.botToken}`,
			},
			body: JSON.stringify(data),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Failed to edit message: ${errorText}`);
		}

		return (await response.json()) as APIMessage;
	}

	/**
	 * Create a follow-up message
	 */
	async createFollowupMessage(interactionToken: string, data: RESTPostAPIWebhookWithTokenJSONBody): Promise<APIMessage> {
		const response = await fetch(`${RouteBases.api}${Routes.webhook(this.applicationId, interactionToken)}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bot ${this.botToken}`,
			},
			body: JSON.stringify(data),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Failed to send follow-up message: ${errorText}`);
		}

		return (await response.json()) as APIMessage;
	}

	/**
	 * Create a simple embed with fields
	 */
	createEmbed(options: {
		title?: string;
		description?: string;
		color?: number;
		fields?: APIEmbedField[];
		thumbnail?: string;
		image?: string;
		footer?: string;
		timestamp?: boolean;
	}): APIEmbed {
		return {
			title: options.title,
			description: options.description,
			color: options.color ?? 0x5865f2, // Discord brand color as default
			fields: options.fields,
			thumbnail: options.thumbnail ? { url: options.thumbnail } : undefined,
			image: options.image ? { url: options.image } : undefined,
			footer: options.footer ? { text: options.footer } : undefined,
			timestamp: options.timestamp ? new Date().toISOString() : undefined,
		};
	}

	/**
	 * Create an error embed
	 */
	createErrorEmbed(errorMessage: string): APIEmbed {
		return this.createEmbed({
			title: 'Error',
			description: errorMessage,
			color: 0xed4245, // Discord red color
			timestamp: true,
		});
	}

	/**
	 * Create a success embed
	 */
	createSuccessEmbed(message: string, fields?: APIEmbedField[]): APIEmbed {
		return this.createEmbed({
			title: 'Success',
			description: message,
			color: 0x57f287, // Discord green color
			fields,
			timestamp: true,
		});
	}

	/**
	 * Register commands with Discord API
	 */
	async registerCommands(
		commands: RESTPostAPIApplicationCommandsJSONBody[],
		guildId?: string,
	): Promise<RESTPutAPIApplicationCommandsResult> {
		const route = guildId ? Routes.applicationGuildCommands(this.applicationId, guildId) : Routes.applicationCommands(this.applicationId);

		const response = await fetch(`${RouteBases.api}${route}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bot ${this.botToken}`,
			},
			body: JSON.stringify(commands),
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(`Error registering commands: ${JSON.stringify(errorData)}`);
		}

		return (await response.json()) as RESTPutAPIApplicationCommandsResult;
	}

	/**
	 * Create a response to update a message
	 */
	createUpdateMessageResponse(data: APIInteractionResponseCallbackData): APIInteractionResponse {
		return {
			type: InteractionResponseType.UpdateMessage,
			data,
		};
	}

	/**
	 * Helper to handle errors uniformly
	 */
	async handleError(error: Error, interactionToken: string, editOriginal = true): Promise<void> {
		console.error('Discord API Error:', error);

		const errorEmbed = this.createErrorEmbed(error.message || 'An unknown error occurred');

		try {
			if (editOriginal) {
				await this.editOriginalResponse(interactionToken, { embeds: [errorEmbed] });
			} else {
				await this.createFollowupMessage(interactionToken, { embeds: [errorEmbed] });
			}
		} catch (followupError) {
			console.error('Failed to send error message:', followupError);
		}
	}

	public getItemTypeEmoji(itemType: string): string {
		switch (itemType.toLowerCase()) {
			case 'outfit':
				return '👕';
			case 'backpack':
				return '🎒';
			case 'pickaxe':
				return '⛏️';
			case 'glider':
				return '☂️';
			case 'wrap':
				return '🎁';
			case 'emote':
				return '💃';
			case 'music':
				return '🎵';
			case 'spray':
				return '🎨';
			case 'contrail':
				return '💫';
			case 'pet':
				return '🐕';
			case 'loadingscreen':
				return '🖼️';
			case 'banner':
				return '🚩';
			case 'toy':
				return '🎮';
			default:
				return '🎯';
		}
	}

	public getRarityEmoji(rarity: string): string {
		switch (rarity.toLowerCase()) {
			case 'common':
				return '⚪';
			case 'uncommon':
				return '🟢';
			case 'rare':
				return '🔵';
			case 'epic':
				return '🟣';
			case 'legendary':
				return '🟠';
			case 'mythic':
				return '🟡';
			case 'marvel':
			case 'dc':
			case 'icon':
			case 'gaming':
			case 'starwars':
				return '⭐';
			default:
				return '⚡';
		}
	}

	public static construct(env: Env): DiscordAPI {
		if (!env.DISCORD_APPLICATION_ID || !env.DISCORD_BOT_TOKEN || !env.DISCORD_PUBLIC_KEY) {
			throw new Error('Missing required Discord environment variables');
		}

		return new DiscordAPI(env.DISCORD_APPLICATION_ID, env.DISCORD_BOT_TOKEN, env.DISCORD_PUBLIC_KEY);
	}
}

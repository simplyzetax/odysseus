import { ApplicationCommandType, RESTPostAPIApplicationCommandsJSONBody, ApplicationCommandOptionType } from 'discord-api-types/v10';
import { profileTypesEnum } from '@core/db/schemas/profile';

// Define the commands array with proper API command types
export const DISCORD_COMMANDS: readonly RESTPostAPIApplicationCommandsJSONBody[] = [
	{
		name: 'register',
		description: 'Creates an account for you to test the backend',
		type: ApplicationCommandType.ChatInput,
	},
	{
		name: 'ping',
		description: 'Measures the latency of the bot',
		type: ApplicationCommandType.ChatInput,
	},
	{
		name: 'additem',
		description: 'Adds an item to your account',
		type: ApplicationCommandType.ChatInput,
		options: [
			{
				type: ApplicationCommandOptionType.String,
				name: 'item_id',
				description: 'The item ID to add (e.g. AthenaCharacter:CID_012...)',
				required: true,
				autocomplete: true,
			},
			{
				type: ApplicationCommandOptionType.String,
				name: 'profile_type',
				description: 'The profile type to add the item to',
				required: true,
				choices: Object.entries(profileTypesEnum).map(([key, value]) => ({
					name: key, // Display name
					value: value, // Actual value
				})),
			},
		],
	},
] as const;

// Infer the command names from the array for type safety
export type CommandName = (typeof DISCORD_COMMANDS)[number]['name'];

// Create a commands map for better type safety
export type CommandsMap = {
	[key in CommandName]: RESTPostAPIApplicationCommandsJSONBody;
};

// Convert array to map for easier access
export const COMMANDS_MAP: CommandsMap = DISCORD_COMMANDS.reduce((acc, command) => {
	acc[command.name as CommandName] = command;
	return acc;
}, {} as CommandsMap);

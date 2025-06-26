import {
    ApplicationCommandType,
    RESTPostAPIApplicationCommandsJSONBody,
    RESTPutAPIApplicationCommandsResult,
    RESTError,
    RouteBases,
    Routes,
    ApplicationCommandOptionType
} from "discord-api-types/v10";

import { app } from "@core/app";
import { profileTypesEnum } from "@core/db/schemas/profile";

//TODO: Add auth to this to prevent unauthorized access

// Define the commands array with proper API command types
export const DISCORD_COMMANDS: readonly RESTPostAPIApplicationCommandsJSONBody[] = [
    {
        name: 'register',
        description: 'Creates an account for you to test the backend',
        type: ApplicationCommandType.ChatInput
    },
    {
        name: 'ping',
        description: 'Measures the latency of the bot',
        type: ApplicationCommandType.ChatInput
    },
    {
        name: 'additem',
        description: 'Adds an item to your account',
        type: ApplicationCommandType.ChatInput,
        options: [
            {
                type: ApplicationCommandOptionType.String,
                name: "item_id",
                description: "The item ID to add (e.g. AthenaCharacter:CID_012...)",
                required: true,
                autocomplete: true
            },
            {
                type: ApplicationCommandOptionType.String,
                name: "profile_type",
                description: "The profile type to add the item to",
                required: true,
                choices: Object.entries(profileTypesEnum).map(([key, value]) => ({
                    name: key, // Display name
                    value: value // Actual value
                }))
            }
        ]
    }
] as const;

// Infer the command names from the array for type safety
export type CommandName = typeof DISCORD_COMMANDS[number]['name'];

// Create a commands map for better type safety
export type CommandsMap = {
    [key in CommandName]: RESTPostAPIApplicationCommandsJSONBody;
};

// Convert array to map for easier access
export const COMMANDS_MAP: CommandsMap = DISCORD_COMMANDS.reduce((acc, command) => {
    acc[command.name as CommandName] = command;
    return acc;
}, {} as CommandsMap);

// Endpoint to register commands with Discord
app.post('/discord/bot/commands', async (c) => {
    const { DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID } = c.env;

    if (!DISCORD_BOT_TOKEN || !DISCORD_APPLICATION_ID) {
        return c.json({ error: 'Missing environment variables' }, 400);
    }

    try {
        // Global commands
        const response = await fetch(
            `${RouteBases.api}${Routes.applicationCommands(DISCORD_APPLICATION_ID)}`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
                },
                body: JSON.stringify(DISCORD_COMMANDS),
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown error' })) as RESTError;
            return c.json({ error: `Error registering commands: ${errorData.message}` }, 500);
        }

        const data = await response.json() as RESTPutAPIApplicationCommandsResult;
        return c.json({ commands: data });
    } catch (error: any) {
        return c.json({ error: error.message }, 500);
    }
});


// Endpoint to delete commands from Discord
app.delete('/discord/bot/commands', async (c) => {
    const { DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID } = c.env;

    if (!DISCORD_BOT_TOKEN || !DISCORD_APPLICATION_ID) {
        return c.json({ error: 'Missing environment variables' }, 400);
    }

    try {
        const { commandId } = c.req.query();

        // If commandId is provided, delete specific command
        if (commandId) {
            const response = await fetch(
                `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands/${commandId}`,
                {
                    method: 'DELETE',
                    headers: {
                        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
                    },
                }
            );

            if (!response.ok) {
                const text = await response.text();
                return c.json({ error: `Error deleting command: ${text}` }, 500);
            }

            return c.json({ success: true, message: `Command ${commandId} deleted` });
        }
        // If no commandId, delete all commands by overwriting with empty array
        else {
            const response = await fetch(
                `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
                    },
                    body: JSON.stringify([]),
                }
            );

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

//export
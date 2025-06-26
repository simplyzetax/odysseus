import { app } from "@core/app";
import { getDB } from "@core/db/client";
import { ACCOUNTS } from "@core/db/schemas/account";
import { ITEMS } from "@core/db/schemas/items";
import { PROFILES, profileTypesEnum } from "@core/db/schemas/profile";
import { createDiscordAPI, verifyKey } from "@utils/discord/general";
import { fetchCosmeticById, searchCosmeticsByName } from "@utils/fortniteapi/general";
import { FortniteProfile } from "@utils/mcp/base-profile";
import {
    InteractionType,
    ApplicationCommandOptionType,
    InteractionResponseType
} from "discord-api-types/v10";
import { and, eq } from "drizzle-orm";

app.use('/discord/bot/interactions', async (c, next) => {
    // Only accept POST requests
    if (c.req.method !== 'POST') {
        return c.text('Method not allowed', 405);
    }

    // Get the signature and timestamp from the request headers
    const signature = c.req.header('X-Signature-Ed25519');
    const timestamp = c.req.header('X-Signature-Timestamp');

    if (!signature || !timestamp) {
        return c.text('Unauthorized', 401);
    }

    // Get the request body as text
    const body = await c.req.text();
    c.unsafeVariables.rawBody = body;

    // Verify the request is coming from Discord
    const isValid = verifyKey(
        body,
        signature,
        timestamp,
        c.env.DISCORD_PUBLIC_KEY
    );

    if (!isValid) {
        return c.text('Unauthorized', 401);
    }

    c.unsafeVariables.timestamp = Date.now();

    await next();
});

// Handle Discord interactions
app.post('/discord/bot/interactions', async (c) => {
    const rawBody = c.unsafeVariables.rawBody;
    if (!rawBody) {
        console.error("rawBody is undefined");
        throw new Error("rawBody unsafe variable is undefined");
    }

    // Create Discord API instance
    const discord = createDiscordAPI(c.env);

    // Parse the interaction
    const interaction = discord.parseInteraction(rawBody);

    // Handle Discord's PING verification
    if (interaction.type === InteractionType.Ping) {
        return c.json(discord.createPingResponse());
    }

    // Handle commands
    switch (interaction.type) {
        // Handle autocomplete interactions
        case InteractionType.ApplicationCommandAutocomplete: {
            if (interaction.data.name === 'additem') {
                // Check which option is being autocompleted
                const focusedOption = interaction.data.options.find(opt => 'focused' in opt && opt.focused);

                if (focusedOption && focusedOption.name === 'item_id') {
                    // Use type assertion with a specific autocomplete option type
                    type AutocompleteOption = {
                        name: string;
                        type: number;
                        value: string;
                        focused: boolean;
                    };

                    const searchQuery = (focusedOption as AutocompleteOption).value || '';

                    // Get matching cosmetics
                    const matches = await searchCosmeticsByName(searchQuery);

                    // Return the autocomplete choices
                    return c.json({
                        type: InteractionResponseType.ApplicationCommandAutocompleteResult,
                        data: {
                            choices: matches.slice(0, 25).map(cosmetic => {
                                // Get emoji based on item type
                                const typeEmoji = discord.getItemTypeEmoji(cosmetic.type.value);
                                // Get emoji based on rarity
                                const rarityEmoji = discord.getRarityEmoji(cosmetic.rarity.value);

                                return {
                                    // Format: [Type Emoji] [Rarity Emoji] Item Name
                                    name: `${typeEmoji} ${rarityEmoji} ${cosmetic.name}`,
                                    value: `${cosmetic.type.backendValue}:${cosmetic.id}`,
                                };
                            })
                        }
                    });
                }
            }
        }
        case InteractionType.ApplicationCommand: {
            const { name: commandName } = interaction.data;

            const db = getDB(c);

            // Command handler
            switch (commandName) {
                case 'register': {
                    // Send deferred response
                    const deferredResponse = discord.createDeferredResponse(true);

                    // Process in background
                    c.executionCtx.waitUntil((async () => {
                        try {

                            // Get the user
                            const user = discord.getInteractionUser(interaction);
                            if (!user) throw new Error("User not found");

                            const [existingAccount] = await db.select().from(ACCOUNTS).where(eq(ACCOUNTS.discordId, user.id));
                            if (existingAccount) throw new Error("You have already registered");

                            const email = `${crypto.randomUUID()}@fortnite.ac`;
                            const password = crypto.randomUUID();

                            // Create the account
                            const [account] = await db.insert(ACCOUNTS).values({
                                email,
                                displayName: user.global_name ?? "Unset",
                                discordId: user.id,
                                passwordHash: ""
                            }).returning();

                            // Create profiles
                            for (const profileType of Object.values(profileTypesEnum)) {
                                await db.insert(PROFILES).values({
                                    accountId: account.id,
                                    type: profileType
                                });
                            }

                            // Create embed with account info
                            const embed = discord.createEmbed({
                                description: "Successfully registered! You can now use the provided email and password to login and test the backend.",
                                color: 0x5865F2,
                                fields: [
                                    {
                                        name: "Email",
                                        value: `\`${email}\``,
                                        inline: false
                                    },
                                    {
                                        name: "Password",
                                        value: `||${password}||`,
                                        inline: false
                                    }
                                ]
                            });

                            // Edit response with embed
                            await discord.editOriginalResponse(interaction.token, { embeds: [embed] });
                        } catch (error) {
                            await discord.handleError(error instanceof Error ? error : new Error(String(error)), interaction.token);
                        }
                    })());

                    return c.json(deferredResponse);
                }

                case 'additem': {
                    const deferredResponse = discord.createDeferredResponse(true);

                    c.executionCtx.waitUntil((async () => {
                        try {
                            const itemId = discord.getOptionValue(interaction, 'item_id', ApplicationCommandOptionType.String);
                            const profileType = discord.getOptionValue(interaction, 'profile_type', ApplicationCommandOptionType.String);

                            if (!itemId) throw new Error("Item ID is required");
                            if (!profileType) throw new Error("Profile type is required");

                            if(!FortniteProfile.isValidProfileType(profileType)) throw new Error("Invalid profile type");

                            const itemTemplateId = itemId.split(':')[1];
                            if (!itemTemplateId) throw new Error('You need to provide a valid item ID (e.g. AthenaCharacter:CID_012...)');

                            // Fetch item data from Fortnite API directly
                            const itemData = await fetchCosmeticById(itemTemplateId);
                            if (!itemData) throw new Error(`Item with ID "${itemTemplateId}" not found`);

                            // Get user and find account
                            const user = discord.getInteractionUser(interaction);
                            if (!user) throw new Error("User not found");

                            const [userAccount] = await db.select().from(ACCOUNTS).where(eq(ACCOUNTS.discordId, user.id));
                            if (!userAccount) throw new Error("You need to register first using /register");

                            const [profile] = await db.select().from(PROFILES).where(and(
                                eq(PROFILES.accountId, userAccount.id),
                                eq(PROFILES.type, profileType)
                            ));

                            if (!profile) throw new Error("Profile not found");

                            // Add item to user's profile
                            await db.insert(ITEMS).values({
                                profileId: profile.id,
                                templateId: itemId,
                            });

                            // Create success embed
                            const embed = discord.createEmbed({
                                title: "Item Added Successfully",
                                description: "The item has been added to your account.",
                                color: 0x5865F2,
                                fields: [
                                    {
                                        name: "Item Name",
                                        value: itemData.name || "Unknown",
                                        inline: true
                                    },
                                    {
                                        name: "Item ID",
                                        value: `\`${itemTemplateId}\``,
                                        inline: true
                                    },
                                    {
                                        name: "Rarity",
                                        value: itemData.rarity?.displayValue || "Unknown",
                                        inline: false
                                    }
                                ],
                                thumbnail: itemData.images.icon
                            });

                            await discord.editOriginalResponse(interaction.token, { embeds: [embed] });
                        } catch (error) {
                            await discord.handleError(error instanceof Error ? error : new Error(String(error)), interaction.token);
                        }
                    })());

                    return c.json(deferredResponse);
                }

                case 'ping': {
                    // Send initial deferred response
                    const deferredResponse = discord.createDeferredResponse(true);

                    // Update the message with latency information after processing
                    c.executionCtx.waitUntil((async () => {
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
                                title: "🏓 Pong!",
                                description: "System status information",
                                color: 0x5865F2,
                                fields: [
                                    {
                                        name: "Discord API",
                                        value: `${Math.round(discordLatency)}ms`,
                                        inline: true
                                    },
                                    {
                                        name: "Database",
                                        value: `${Math.round(dbLatency)}ms`,
                                        inline: true
                                    },
                                    {
                                        name: "Worker",
                                        value: cfWorker,
                                        inline: true
                                    },
                                    {
                                        name: "CF Ray",
                                        value: cfRay,
                                        inline: true
                                    },
                                    {
                                        name: "Region",
                                        value: c.req.header('cf-region') || 'Unknown',
                                        inline: true
                                    }
                                ],
                            });

                            // Edit original response with the embed
                            await discord.editOriginalResponse(interaction.token, { embeds: [embed] });
                        } catch (error) {
                            await discord.handleError(error instanceof Error ? error : new Error(String(error)), interaction.token);
                        }
                    })());

                    return c.json(deferredResponse);
                }

                default:
                    return c.json(discord.createMessageResponse(`Command '${commandName}' not implemented.`, true));
            }
        }
        case InteractionType.MessageComponent: {
            const customId = interaction.data.custom_id;
            return c.json(discord.createMessageResponse(`You interacted with component: ${customId}`, true));
        }
    }

    // Return a 400 for unhandled interaction types
    return c.json({ error: 'Unhandled interaction type' }, 400);
});

//export
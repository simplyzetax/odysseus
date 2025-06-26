import { createDiscordAPI } from "@utils/discord/general";
import { searchCosmeticsByName } from "@utils/fortniteapi/general";
import { InteractionResponseType } from "discord-api-types/v10";
import type { APIApplicationCommandAutocompleteInteraction } from "discord-api-types/v10";

export async function handleAutocomplete(
    interaction: APIApplicationCommandAutocompleteInteraction,
    c: any
): Promise<Response> {
    const discord = createDiscordAPI(c.env);

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
            return new Response(JSON.stringify({
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
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    // Default response if no autocomplete handler found
    return new Response(JSON.stringify({
        type: InteractionResponseType.ApplicationCommandAutocompleteResult,
        data: { choices: [] }
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
} 
import type { APIApplicationCommandInteraction, APIApplicationCommandAutocompleteInteraction } from "discord-api-types/v10";

export interface CommandHandler {
    name: string;
    execute: (interaction: APIApplicationCommandInteraction, context: any) => Promise<Response>;
}

export interface AutocompleteHandler {
    name: string;
    execute: (interaction: APIApplicationCommandAutocompleteInteraction, context: any) => Promise<Response>;
}

export type InteractionHandler = CommandHandler | AutocompleteHandler; 
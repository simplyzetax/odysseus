// Import all bot modules to register routes
import './routes/interactions';
import './routes/commandManagement';

// Export useful types and configurations
export { DISCORD_COMMANDS } from './config/commandDefinitions';
export type { CommandHandler, AutocompleteHandler, InteractionHandler } from './types/interactions';
export { commands, commandsMap, registerCommand, pingCommand, additemCommand } from './commands/index';

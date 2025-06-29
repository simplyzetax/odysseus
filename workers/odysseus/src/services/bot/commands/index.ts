import { registerCommand } from './register';
import { pingCommand } from './ping';
import { additemCommand } from './additem';
import type { CommandHandler } from '../types/interactions';

export const commands: CommandHandler[] = [registerCommand, pingCommand, additemCommand];

export const commandsMap = new Map<string, CommandHandler>(commands.map((cmd) => [cmd.name, cmd]));

export { registerCommand, pingCommand, additemCommand };

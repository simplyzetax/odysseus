# Discord Bot Service

This directory contains the Discord bot implementation with a clean, modular structure.

## Structure

```
src/services/bot/
├── commands/           # Individual command implementations
│   ├── additem.ts     # Add item command
│   ├── ping.ts        # Ping command
│   ├── register.ts    # Register command
│   └── index.ts       # Command exports
├── config/            # Configuration files
│   └── commandDefinitions.ts  # Discord command definitions
├── handlers/          # Interaction handlers
│   ├── autocomplete.ts        # Autocomplete interactions
│   ├── interactionRouter.ts   # Main interaction router
│   └── messageComponent.ts    # Message component interactions
├── middleware/        # Middleware functions
│   └── discordVerification.ts # Discord signature verification
├── routes/           # Route handlers
│   └── commandManagement.ts   # Command registration/deletion routes
├── types/            # Type definitions
│   └── interactions.ts        # Discord interaction types
├── interactions.ts   # Main interaction endpoint
├── commands.ts       # Legacy compatibility exports
└── index.ts         # Module entry point
```

## Usage

### Adding a New Command

1. Create a new file in `commands/` (e.g., `mycommand.ts`)
2. Implement the `CommandHandler` interface
3. Add your command to `commands/index.ts`
4. Add the command definition to `config/commandDefinitions.ts`

### Command Structure

```typescript
import type { CommandHandler } from '../types/interactions';

export const myCommand: CommandHandler = {
	name: 'mycommand',
	async execute(interaction, c) {
		// Command implementation
		return new Response(/* ... */);
	},
};
```

### Adding Autocomplete

Add autocomplete logic in `handlers/autocomplete.ts` for commands that need it.

### Environment Variables

- `DISCORD_BOT_TOKEN` - Your Discord bot token
- `DISCORD_APPLICATION_ID` - Your Discord application ID
- `DISCORD_PUBLIC_KEY` - Your Discord public key for signature verification

## Routes

- `POST /discord/bot/interactions` - Discord interactions endpoint
- `POST /discord/bot/commands` - Register commands with Discord
- `DELETE /discord/bot/commands` - Delete commands from Discord

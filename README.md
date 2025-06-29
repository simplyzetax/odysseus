# Odysseus Monorepo

A Cloudflare Workers monorepo containing multiple services for the Odysseus project.

## Services

- **`workers/odysseus`** - Main application with Hono framework, Discord bot, XMPP server, and Fortnite API integration
- **`workers/manifestify`** - Manifest parsing service

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono (for odysseus)
- **Database**: PostgreSQL with Drizzle ORM
- **Validation**: Arktype for runtime validation
- **Authentication**: JWT with Jose library
- **Package Manager**: pnpm with workspaces

## Development Setup

### Prerequisites

- Node.js (v18 or later)
- pnpm
- PostgreSQL (for local development)

### Installation

```bash
# Install dependencies for all workspaces
pnpm install

# Generate TypeScript types for Cloudflare Workers
pnpm cf-typegen
```

### Development

```bash
# Start the main odysseus service
pnpm dev

# Start the manifestify service
pnpm dev:manifestify

# Build all services
pnpm build

# Lint all code
pnpm lint

# Format all code
pnpm format
```

### Deployment

```bash
# Deploy all services
pnpm deploy

# Deploy specific service
pnpm --filter=odysseus deploy
pnpm --filter=manifestify deploy
```

## Project Structure

```
odysseus/
├── workers/
│   ├── odysseus/           # Main application
│   │   ├── src/
│   │   │   ├── core/       # Core application logic
│   │   │   ├── services/   # Service implementations
│   │   │   ├── middleware/ # Middleware functions
│   │   │   └── utils/      # Utility functions
│   │   └── package.json
│   └── manifestify/        # Manifest parsing service
│       ├── src/
│       └── package.json
├── drizzle/               # Database migrations
├── public/                # Static assets
├── package.json           # Root workspace configuration
└── pnpm-workspace.yaml    # pnpm workspace configuration
```

## Database

The project uses Drizzle ORM with PostgreSQL. To manage the database:

```bash
# Push schema changes to database
pnpm push
```

## Path Aliases (Odysseus)

The odysseus service uses the following path aliases:

- `@core/*` - Core application logic
- `@utils/*` - Utility functions
- `@otypes/*` - Type definitions
- `@services/*` - Service implementations
- `@middleware/*` - Middleware functions

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- Cloudflare account with Workers enabled
- PostgreSQL database
- Discord application (for bot features)

### Environment Variables

```json
{
	"vars": {
		"JWT_SECRET": "your-jwt-secret",
		"DISCORD_TOKEN": "your-discord-bot-token",
		"DISCORD_PUBLIC_KEY": "your-discord-public-key",
		"DATABASE_URL": "your-postgresql-connection-string"
	}
}
```

### Database Configuration

The project uses Drizzle ORM with PostgreSQL. Schema definitions are located in `src/core/db/schemas/`.

## 🤖 Discord Bot Commands

- `/ping` - Test bot connectivity
- `/register` - Register new accounts
- `/additem` - Add items to player locker

## 📊 Performance & Scaling

- **Edge Deployment**: Runs on Cloudflare's global edge network
- **Caching**: Intelligent caching with Durable Objects
- **Rate Limiting**: Built-in rate limiting middleware
- **Database Optimization**: Efficient queries with Drizzle ORM

## 🔄 Development Workflow

### Code Style

- **ESLint** configuration for consistent code style
- **TypeScript** for type safety
- **Functional programming** patterns preferred
- **Early returns** for cleaner code flow

### Database Migrations

```bash
# Generate migration
pnpm db:generate

# Apply migrations
pnpm db:migrate

# Reset database (development)
pnpm db:reset
```

## 🙏 Acknowledgments

- [Epic Games](https://www.epicgames.com/) for Fortnite
- [Cloudflare](https://www.cloudflare.com/) for Workers platform
- [Hono](https://hono.dev/) development team
- [Drizzle](https://orm.drizzle.team/) ORM team

---

<p align="center">
  <strong>Built with ❤️ by Zetax</strong>
</p>

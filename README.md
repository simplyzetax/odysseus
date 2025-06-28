# 🚀 Odysseus

> A high-performance Fortnite backend server built on Cloudflare Workers

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Hono](https://img.shields.io/badge/Hono-E36002?style=for-the-badge&logo=hono&logoColor=white)](https://hono.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)

## 📖 Overview

Odysseus is a modern, scalable backend server that provides a complete Fortnite game server implementation with Discord integration. Built on Cloudflare Workers for global edge deployment, it offers lightning-fast performance and enterprise-grade reliability.

## 🛠️ Tech Stack

### Core Technologies

- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/) - Edge computing platform
- **Framework**: [Hono](https://hono.dev/) - Ultrafast web framework
- **Language**: [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- **Database**: [PostgreSQL](https://www.postgresql.org/) with [Drizzle ORM](https://orm.drizzle.team/)

### Key Libraries

- **Validation**: [Arktype](https://arktype.io/) - Runtime type validation
- **Authentication**: [Jose](https://github.com/panva/jose) - JWT library
- **API Integration**: Discord API, Fortnite API
- **Caching**: Cloudflare Durable Objects

## 🏗️ Architecture

```
📁 src/
├── 🧠 core/           # Core application logic
│   ├── app.ts         # Main Hono application
│   ├── db/            # Database schemas and client
│   └── error.ts       # Centralized error handling
├── 🔒 middleware/     # Request middleware
│   ├── auth/          # Authentication middleware
│   ├── core/          # Core middleware (rate limiting, etc.)
│   └── game/          # Game-specific middleware
├── 🛠️ services/       # Service implementations
│   ├── backend/       # Main backend routes
│   └── bot/           # Discord bot service
├── 📝 types/          # TypeScript type definitions
└── 🔧 utils/          # Utility functions
```

### Path Aliases

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

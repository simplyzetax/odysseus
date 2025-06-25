import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

// Load environment variables from .dev.vars
config({ path: '.dev.vars' });

export default defineConfig({
    schema: './src/core/db/schemas/**/*.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL!
    },
});
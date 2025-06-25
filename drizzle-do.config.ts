import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    schema: './src/core/db/schemas/cache/*.ts',
    out: './drizzle-do',
    dialect: 'sqlite',
    driver: 'durable-sqlite'
}); 
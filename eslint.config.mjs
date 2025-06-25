import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ["dist/**", "drizzle.config.ts", "vite.config.ts", "eslint.config.mjs", "drizzle-do.config.ts"],
    },
    ...tseslint.configs.recommended,
    {
        files: ["**/*.ts", "**/*.tsx"],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-empty-object-type': 'off',
        },
    }
); 
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: ['dist/**', './drizzle/**', 'vite.config.ts', 'eslint.config.mjs', 'worker-configuration.d.ts'],
	},
	...tseslint.configs.recommended,
	{
		files: ['**/*.ts', '**/*.tsx'],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				project: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: {
			drizzle: await import('eslint-plugin-drizzle'),
		},
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-empty-object-type': 'off',
			'drizzle/enforce-delete-with-where': ['error', { drizzleObjectName: ['db'] }],
			'drizzle/enforce-update-with-where': ['error', { drizzleObjectName: ['db'] }],
			quotes: ['error', 'single', { avoidEscape: true }],
		},
	},
);

import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: [
			'.wrangler/**',
			'pkg/**',
			'type.d.ts',
			'worker-configuration.d.ts',
			'vite-env.d.ts',
			'*.wasm',
			'**/*.wasm'
		],
	},
	...tseslint.configs.recommended,
	{
		files: ['**/*.ts', '**/*.tsx'],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				project: './tsconfig.json',
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-empty-object-type': 'off',
			quotes: ['error', 'single', { avoidEscape: true }],
			'@typescript-eslint/no-unused-vars': 'warn',
		},
	},
); 
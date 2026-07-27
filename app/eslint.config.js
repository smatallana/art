import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import svelteConfig from './svelte.config.js';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: {
			globals: {
				window: 'readonly',
				document: 'readonly',
				navigator: 'readonly',
				console: 'readonly',
				fetch: 'readonly',
				URL: 'readonly',
				Request: 'readonly',
				Response: 'readonly',
				Blob: 'readonly',
				crypto: 'readonly',
				indexedDB: 'readonly',
				localStorage: 'readonly',
				location: 'readonly',
				history: 'readonly',
				performance: 'readonly',
				confirm: 'readonly',
				alert: 'readonly',
				Image: 'readonly',
				AbortSignal: 'readonly',
				Event: 'readonly',
				KeyboardEvent: 'readonly',
				HTMLInputElement: 'readonly',
				HTMLElement: 'readonly',
				setTimeout: 'readonly',
				clearTimeout: 'readonly',
				setInterval: 'readonly',
				clearInterval: 'readonly'
			}
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: {
			parserOptions: { parser: ts.parser, svelteConfig }
		}
	},
	{
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			],
			// Base-path handling is centralized and covered by E2E; the rule also
			// false-positives on external museum links.
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		ignores: ['build/', '.svelte-kit/', 'dist/']
	}
);

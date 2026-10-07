import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	resolve: {
		// The obsidian package is type declarations only; anything that reaches
		// for it at runtime under test gets the few values the plugin uses.
		alias: { obsidian: fileURLToPath(new URL('./test/obsidian-stub.ts', import.meta.url)) },
	},
	test: {
		include: ['test/**/*.test.ts'],
		benchmark: { include: ['test/**/*.bench.ts'] },
	},
});

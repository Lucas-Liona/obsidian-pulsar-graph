import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	// Build scripts are Node tooling, not plugin runtime, and the community
	// directory's scanner ignores *.mjs as well.
	globalIgnores(["main.js", "node_modules/**", "**/*.mjs"]),
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
			},
		},
		rules: {
			// The declarative settings API this rule wants exists only in
			// Obsidian 1.13+; manifest minAppVersion is 1.8.0. Revisit when
			// that floor rises.
			"obsidianmd/settings-tab/prefer-setting-definitions": "off",
		},
	},
	{
		// The end-to-end tests run in Node and drive a desktop Obsidian, never
		// a phone, and TypeScript already checks every name they use.
		files: ["test/e2e/**"],
		rules: {
			"obsidianmd/no-nodejs-modules": "off",
			"no-undef": "off",
		},
	},
]);

// Pulsar inside a real Obsidian, through wdio-obsidian-service. Everything
// else under test/ runs against the fake Obsidian in test/harness; this is the
// check that the undocumented graph internals AGENTS.md describes still hold
// in the app people actually run.
//
// Run with `npm run e2e`, which builds first: the plugin under test is the
// main.js at the repo root. OBSIDIAN_VERSIONS picks the Obsidian app and
// installer versions, as "app/installer" pairs separated by spaces.
//
// The oldest pair is the first public release at or above manifest.json's
// minAppVersion, on the oldest installer that runs it. "earliest" would be
// minAppVersion itself, 1.8.0, which only ever went to Insiders, as did 1.8.1
// and 1.8.2: downloading those needs an Insiders login. Move this up with
// minAppVersion.
import * as path from 'node:path';
import { env, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseObsidianVersions } from 'wdio-obsidian-service';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

// Downloaded Obsidian versions, kept between runs. CI caches this directory.
const cacheDir = path.resolve(root, '.obsidian-cache');

const versions = await parseObsidianVersions(env.OBSIDIAN_VERSIONS ?? '1.8.3/earliest latest/latest', { cacheDir });

if (env.CI) {
    // The resolved versions, which the workflow uses as its cache key.
    stdout.write(`obsidian-cache-key: ${JSON.stringify(versions)}\n`);
}

export const config: WebdriverIO.Config = {
    runner: 'local',
    framework: 'mocha',
    specs: [path.join(here, 'specs/**/*.e2e.ts')],
    maxInstances: Number(env.WDIO_MAX_INSTANCES ?? 2),
    capabilities: versions.map(([appVersion, installerVersion]) => ({
        browserName: 'obsidian',
        'wdio:obsidianOptions': {
            appVersion,
            installerVersion,
            // Installed but off, so the spec can watch it load and can record
            // Obsidian's own graph hooks before anything wraps them.
            plugins: [{ path: root, enabled: false }],
            vault: path.join(here, 'vault'),
        },
    })),
    services: ['obsidian'],
    reporters: ['obsidian'],
    mochaOpts: {
        ui: 'bdd',
        timeout: 120_000,
    },
    waitforInterval: 250,
    waitforTimeout: 20_000,
    logLevel: 'warn',
    cacheDir,
    injectGlobals: false,
};

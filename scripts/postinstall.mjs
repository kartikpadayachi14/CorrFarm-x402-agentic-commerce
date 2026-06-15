#!/usr/bin/env node
/**
 * Runs automatically after `npm install`.
 *  - If .env.local is missing AND we're in an interactive terminal, launch the
 *    key-entry wizard so a fresh machine is ready in one step.
 *  - Otherwise (CI, no TTY, or keys already present) just print a hint and exit
 *    0 so installs never break.
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = join(ROOT, '.env.local');

if (existsSync(ENV_PATH)) {
  console.log('[setup] .env.local found — run `npm run setup` to change keys.');
  process.exit(0);
}

if (!process.stdin.isTTY) {
  console.log('\n[setup] No .env.local yet. Run `npm run setup` to enter your API keys.\n');
  process.exit(0);
}

const res = spawnSync(process.execPath, [join(ROOT, 'scripts', 'setup.mjs')], {
  stdio: 'inherit',
});
process.exit(res.status ?? 0);

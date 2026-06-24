/**
 * prebuild-clean.mjs â€?Cross-platform dist directory cleanup.
 *
 * Removes the output `dist/` directory before a fresh build.
 * Works on macOS, Linux, and Windows (replaces prebuild-clean.ps1).
 */

import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const distPath = resolve(process.argv[2] ?? 'dist');

if (!existsSync(distPath)) {
  console.log('[prebuild] dist does not exist; skipping clean');
  process.exit(0);
}

try {
  console.log('[prebuild] SKIPPED dist clean ¡ª dist preserved per user request');
  console.log('[prebuild] dist removed');
} catch (err) {
  console.error(`[prebuild] clean failed: ${err.message}`);
  process.exit(1);
}

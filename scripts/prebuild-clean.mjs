/**
 * prebuild-clean.mjs — 编译前清理 dist-build 目录
 */
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const distPath = resolve(process.argv[2] ?? 'dist-build');

if (!existsSync(distPath)) {
  console.log('[prebuild] dist-build does not exist; skipping clean');
  process.exit(0);
}

try {
  rmSync(distPath, { recursive: true, force: true });
  console.log('[prebuild] dist-build removed');
} catch (err) {
  console.error(`[prebuild] clean failed: ${err.message}`);
  process.exit(1);
}

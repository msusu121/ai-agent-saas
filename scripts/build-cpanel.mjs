import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nextBinary = require.resolve('next/dist/bin/next');
const result = spawnSync(process.execPath, [nextBinary, 'build'], {
  cwd: process.cwd(),
  env: { ...process.env, CPANEL_STATIC_EXPORT: '1' },
  stdio: 'inherit',
});

process.exit(result.status ?? 1);

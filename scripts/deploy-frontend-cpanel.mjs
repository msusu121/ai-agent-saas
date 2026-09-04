import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const apiOrigin = process.env.API_ORIGIN || 'https://apiagent.akilimatic.com';
const webOrigin = process.env.WEB_ORIGIN || 'https://agent.akilimatic.com';

if (!existsSync('.env')) {
  const envContent = `NEXT_PUBLIC_API_ORIGIN=${apiOrigin}\nWEB_ORIGIN=${webOrigin}\nNODE_ENV=production\nCOOKIE_SECURE=true\nTRUST_PROXY=true\n`;
  writeFileSync('.env', envContent);
  console.log('Created .env with production values');
}

const result = spawnSync(process.execPath, ['node_modules/.bin/next', 'build'], {
  cwd: process.cwd(),
  env: { ...process.env, CPANEL_STATIC_EXPORT: '1', NEXT_PUBLIC_API_ORIGIN: apiOrigin, WEB_ORIGIN: webOrigin, NODE_ENV: 'production', COOKIE_SECURE: 'true', TRUST_PROXY: 'true' },
  stdio: 'inherit',
});

if (result.status !== 0) {
  console.error('Build failed');
  process.exit(1);
}

console.log('\n✅ Frontend built successfully!');
console.log('📁 Upload the contents of the "out/" directory to your cPanel file manager.');
console.log(`   Target: public_html/ on agent.akilimatic.com`);

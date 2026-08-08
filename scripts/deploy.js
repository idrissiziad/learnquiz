#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

const CYAN = '\x1b[36m', GREEN = '\x1b[32m', RED = '\x1b[31m', YELLOW = '\x1b[33m', DIM = '\x1b[2m', RESET = '\x1b[0m';
const log = (m) => console.log(m);

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  return res.status;
}

function has(cmd) {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(probe, [cmd], { stdio: 'ignore' }).status === 0;
}

const platform = (process.env.DEPLOY_PLATFORM || '').toLowerCase();
const pkgPath = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
log(`${CYAN}LearnQuiz deploy${RESET} — ${DIM}platform: Vercel (default)${RESET}`);

// 1) Vercel
if (platform === '' || platform === 'vercel') {
  if (has('vercel')) {
    log(`${GREEN}▶ Deploying to Vercel…${RESET}`);
    const args = process.env.VERCEL_TOKEN
      ? ['--prod', '--yes', '--token', process.env.VERCEL_TOKEN]
      : ['--prod', '--yes'];
    const code = run('vercel', args);
    if (code === 0) log(`${GREEN}✓ Deployed to Vercel${RESET}`);
    else log(`${RED}✗ Vercel CLI exited with ${code}${RESET}`);
    process.exit(code ?? 0);
  }
  log(`${YELLOW}Vercel CLI not found. Install it (npm i -g vercel) and re-run \`npm run deploy\`.${RESET}`);
  log(`${DIM}Or use the Vercel dashboard: https://vercel.com/new${RESET}`);
  if (platform === 'vercel') process.exit(1);
}

// 2) Netlify
if (platform === '' || platform === 'netlify') {
  if (has('netlify')) {
    log(`${GREEN}▶ Deploying to Netlify…${RESET}`);
    const code = run('netlify', ['deploy', '--prod', '--build']);
    process.exit(code ?? 0);
  }
  if (platform === 'netlify') {
    log(`${YELLOW}Netlify CLI not found (npm i -g netlify-cli).${RESET}`);
    process.exit(1);
  }
}

// 3) Cloudflare Pages (wrangler)
if (platform === 'cloudflare') {
  if (has('wrangler')) {
    log(`${GREEN}▶ Deploying to Cloudflare Pages…${RESET}`);
    process.exit(run('wrangler', ['pages', 'deploy', '.next', '--branch', 'main']) ?? 0);
  }
  log(`${YELLOW}wrangler not found (npm i -g wrangler).${RESET}`);
  process.exit(1);
}

// 4) Render (render-cli) — best-effort
if (platform === 'render') {
  if (has('render')) {
    log(`${GREEN}▶ Deploying to Render…${RESET}`);
    process.exit(run('render', ['deploy']) ?? 0);
  }
  log(`${YELLOW}render CLI not found. Use the Render dashboard or blueprint.${RESET}`);
  process.exit(1);
}

log('\nNo deploy platform detected. Two easy options:\n');
log(`${CYAN}A) Vercel (recommended, one-click KV store)${RESET}`);
log(`  1) npm i -g vercel`);
log(`  2) In the Vercel dashboard add a KV store to your project (auto-injects env vars).`);
log(`  3) npm run deploy\n`);
log(`${CYAN}B) Any platform with Node 18+${RESET}`);
log(`  Build with \`npm run build\` then run \`npm start\`. Configure a Redis REST store and set:`);
log(`     KV_REST_API_URL, KV_REST_API_TOKEN  (Vercel KV / Upstash)\n`);
log(`${DIM}Tip: set DEPLOY_PLATFORM=netlify|cloudflare|render to target another CLI.${RESET}`);
process.exit(0);
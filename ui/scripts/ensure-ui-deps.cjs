#!/usr/bin/env node
// Guard for builds that reuse a stale ui/node_modules directory (for example a
// dev container that mounts the repo but keeps dependencies from an older
// image). New runtime dependencies would otherwise fail the Next.js build with
// "Module not found" before anyone gets a chance to run npm install.
const path = require('path');
const { execFileSync } = require('child_process');

const UI_DIR = path.resolve(__dirname, '..');
const REQUIRED = ['react-markdown', 'remark-gfm'];

function isInstalled(name) {
  try {
    require.resolve(name, { paths: [UI_DIR] });
    return true;
  } catch {
    return false;
  }
}

const missing = REQUIRED.filter(name => !isInstalled(name));
if (missing.length === 0) process.exit(0);

console.warn(`[ui] Missing UI dependencies: ${missing.join(', ')}`);
console.warn('[ui] Installing them with npm install --no-save...');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
try {
  // include=dev matters when the container sets NODE_ENV=production: tsc,
  // tailwind, and prisma are devDependencies in this package.
  execFileSync(npm, ['install', '--no-save', '--no-audit', '--no-fund', '--include=dev'], {
    cwd: UI_DIR,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });
} catch (error) {
  console.error('[ui] Dependency install failed. Run "cd ui && npm install" manually and retry.');
  process.exit(typeof error.status === 'number' ? error.status : 1);
}

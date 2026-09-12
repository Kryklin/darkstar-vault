import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Dev Environment directly...');

// npm run start actually runs node scripts/package.js which is interactive.
// We want to run the underlying dev commands.
// "concurrently -k --success first \"ng serve\" \"wait-on http://localhost:4200 && node scripts/dev-wrapper.js\""

const cmd = 'concurrently';
const args = ['-k', '--success', 'first', '"ng serve"', '"wait-on http://localhost:4200 && node scripts/dev-wrapper.js"'];

// We need to run this in a shell for the quoted args to work right with concurrently or just run it via npx/npm exec
// Easiest is to run as a single shell command string if possible, or use npm exec.

// Let's rely on npm to find concurrently.
const child = spawn('npx', [cmd, ...args], {
  stdio: 'inherit',
  shell: true,
  cwd: path.resolve(__dirname, '..'),
});

child.on('error', (err) => {
  console.error('Failed to start:', err);
});

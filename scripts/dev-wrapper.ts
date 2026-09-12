import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { fetchEngines } from './fetch-engines.ts';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

(async () => {
  const { default: chalk } = await import('chalk');

  // Verify or auto-fetch crypto engine binaries from Kryklin/darkstar releases
  const ext = process.platform === 'win32' ? '.exe' : '';
  const binDir = path.resolve(__dirname, '..', 'bin');
  const rustBin = path.join(binDir, `d-arx-512${ext}`);
  const aspAlias = path.join(binDir, `d-asp${ext}`);

  if (!fs.existsSync(rustBin) && !fs.existsSync(aspAlias)) {
    console.log(chalk.cyan('Crypto engine binary missing in ./bin. Fetching from Kryklin/darkstar releases...'));
    await fetchEngines();
  }

  console.log(chalk.blue('Starting Nodemon Wrapper...'));

  const nodemon = spawn('npx', ['nodemon', '--config', 'nodemon.json'], {
    stdio: ['inherit', 'pipe', 'pipe'], // Pipe stdout/stderr to read them
    shell: true,
  });

  nodemon.stdout.on('data', (data) => {
    process.stdout.write(data); // Pass through to console
    const output = data.toString();

    // Detect clean exit from Electron (user closed the window)
    if (output.includes('clean exit - waiting for changes')) {
      console.log(chalk.yellow('\nDetected active app closure. Exiting dev mode...'));
      process.exit(0); // Exit wrapper, allowing concurrently to kill peers
    }
  });

  nodemon.stderr.on('data', (data) => {
    process.stderr.write(data);
  });

  nodemon.on('close', (code) => {
    process.exit(code);
  });
})();

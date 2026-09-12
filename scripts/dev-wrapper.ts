import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { fetchEngines } from './fetch-engines.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  const { default: chalk } = await import('chalk');

  // Verify or auto-fetch crypto engine binaries from Kryklin/darkstar releases
  const ext = process.platform === 'win32' ? '.exe' : '';
  const binDir = path.resolve(__dirname, '..', 'bin');
  const rustBin = path.join(binDir, `d-arx-512${ext}`);
  const arxAlias = path.join(binDir, `d-arx${ext}`);

  if (!fs.existsSync(rustBin) && !fs.existsSync(arxAlias)) {
    console.log(chalk.cyan('Crypto engine binary missing in ./bin. Fetching from Kryklin/darkstar releases...'));
    await fetchEngines();
  }

  console.log(chalk.blue('Starting Nodemon Wrapper...'));

  const nodemonBin = require.resolve('nodemon/bin/nodemon.js');
  const nodemon = spawn(process.execPath, [nodemonBin, '--config', 'nodemon.json'], {
    stdio: ['inherit', 'pipe', 'pipe'],
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

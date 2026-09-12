import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const { spawn } = require('child_process');

(async () => {
  const { default: chalk } = await import('chalk');

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

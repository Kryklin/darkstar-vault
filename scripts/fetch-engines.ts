import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fs = require('fs');
const path = require('path');

(async () => {
  const { default: ora } = await import('ora');
  const { default: chalk } = await import('chalk');

  console.log(chalk.hex('#00ADD8').bold('\n  🔐  D-ASP Crypto Engine Verifier & Downloader\n'));

  const binDir = path.resolve(__dirname, '..', 'bin');
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  const isWindows = process.platform === 'win32';
  const ext = isWindows ? '.exe' : '';
  const rustBinary = path.join(binDir, `d-asp${ext}`);

  const spinner = ora(chalk.blue('Checking local crypto engine binary...')).start();

  if (fs.existsSync(rustBinary)) {
    spinner.succeed(chalk.green(`Engine binary found: ${rustBinary}`));
    console.log(chalk.gray('  Status: Ready for local encryption & testing.\n'));
    process.exit(0);
  }

  spinner.warn(chalk.yellow(`No native engine binary found at ${rustBinary}`));
  console.log(chalk.cyan('\n  The Darkstar Vault UI relies on the D-ASP native core from kryklin/darkstar.'));
  console.log(chalk.white('  To install:'));
  console.log(chalk.dim(`    1. Download the latest release from: ${chalk.underline('https://github.com/Kryklin/darkstar/releases')}`));
  console.log(chalk.dim(`    2. Place the executable into: ${chalk.yellow(binDir)}`));
  console.log(chalk.dim(`    3. Or set DARKSTAR_ENGINE_PATH in .env to the executable path.\n`));
  process.exit(0);
})();
